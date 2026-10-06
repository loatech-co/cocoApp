import Foundation

/// La única dueña del refresh token y el ÚNICO rotador de la familia de
/// Supabase en el teléfono. La cola, el webview, los intents y la tarea de
/// fondo pasan todos por aquí; dos `/auth/refresh` a la vez dispararían la
/// detección de reuso de GoTrue y matarían la familia entera.
final actor NativeSession: Session {
    private struct TokenPair {
        var access: String
        var expiresAt: Date
        /// El `user` tal como llegó: la web lo recibe sin reescribir una clave.
        var userJSON: Data
        var profile: PublicProfile
    }

    private let api: APIClient
    private let keychain: KeychainStore
    private let clock: @Sendable () -> Date
    /// Mayor que los 60 s de la web: lo que la web recibe por el puente no
    /// debe disparar nunca su propio bucle de renovación.
    private let margin: TimeInterval

    private var tokens: TokenPair?
    /// El single-flight: quien llegue mientras hay una renovación en vuelo
    /// espera a ESA, no abre otra.
    private var refreshInFlight: Task<TokenPair, Error>?
    private(set) var currentState: SessionState = .loading

    nonisolated let changes: AsyncStream<SessionState>
    private nonisolated let continuation: AsyncStream<SessionState>.Continuation

    init(
        api: APIClient, keychain: KeychainStore, clock: @Sendable @escaping () -> Date = Date.init,
        margin: TimeInterval = 120
    ) {
        self.api = api
        self.keychain = keychain
        self.clock = clock
        self.margin = margin
        let (stream, cont) = AsyncStream.makeStream(of: SessionState.self)
        changes = stream
        continuation = cont
    }

    var state: SessionState { currentState }

    // MARK: Entrar y restaurar

    /// Al arrancar: si hay refresh en el Keychain se renueva; si no, no hay
    /// sesión. Un fallo de red deja el Keychain intacto y pasa a sin conexión.
    func restore() async {
        guard let refresh = try? keychain.read(.refreshToken), !refresh.isEmpty else {
            publish(.signedOut)
            return
        }
        // Los errores ya dejaron el estado que toca (sinSesion o sinConexion).
        _ = try? await sharedRefresh()
    }

    func signIn(email: String, password: String) async throws -> PublicProfile {
        let data = try await api.sendRaw(
            RequestBuilder.login(email: email, password: password), token: nil)
        let (response, userJSON) = try Self.decodeSession(data)
        guard let refresh = response.refreshToken else { throw APIError.unreadableResponse }
        try keychain.write(refresh, for: .refreshToken)
        publish(tokens: Self.tokens(from: response, userJSON: userJSON, now: clock()))
        return response.user
    }

    // MARK: Access token

    func validAccessToken() async throws -> String {
        if let tokens, isValid(tokens) { return tokens.access }
        return try await sharedRefresh().access
    }

    /// Tras un 401 inesperado: renueva aunque al reloj le parezca vigente.
    func refreshNow() async throws {
        _ = try await sharedRefresh()
    }

    func webSession() async throws -> WebSession {
        let access = try await validAccessToken()
        guard let tokens, tokens.access == access else { throw SessionError.signedOut }
        let remaining = Int(tokens.expiresAt.timeIntervalSince(clock()).rounded(.down))
        return WebSession(accessToken: access, expiresIn: remaining, userJSON: tokens.userJSON)
    }

    // MARK: Salir

    /// Avisa al servidor con el refresh y borra el Keychain pase lo que pase:
    /// quien pulsó «salir» no vuelve a ver su sesión por un fallo de red.
    func signOut() async {
        refreshInFlight?.cancel()
        if let refresh = try? keychain.read(.refreshToken), !refresh.isEmpty {
            try? await api.sendWithoutBody(RequestBuilder.logout(refreshToken: refresh), token: nil)
        }
        closeLocally()
    }

    /// Solo local: la web avisó que el servidor ya cerró la familia.
    func discard() async {
        refreshInFlight?.cancel()
        closeLocally()
    }

    // MARK: Renovación

    private func sharedRefresh() async throws -> TokenPair {
        if let inFlight = refreshInFlight {
            return try await inFlight.value
        }
        let task = Task { try await self.refresh(retryingNetwork: true) }
        refreshInFlight = task
        defer { refreshInFlight = nil }
        return try await task.value
    }

    /// Orden: llamada → escribir el refresh nuevo en el llavero → publicar.
    /// Un `URLError` NUNCA borra el Keychain: reintenta una vez con el mismo
    /// refresh (dentro del intervalo de reuso de GoTrue devuelve la misma
    /// sesión) y, si vuelve a fallar, conserva todo y pasa a sin conexión.
    /// SOLO un 401 real borra el Keychain.
    private func refresh(retryingNetwork: Bool) async throws -> TokenPair {
        guard let refresh = try? keychain.read(.refreshToken), !refresh.isEmpty else {
            closeLocally()
            throw SessionError.signedOut
        }
        var attempts = retryingNetwork ? 2 : 1
        while true {
            attempts -= 1
            do {
                let data = try await api.sendRaw(
                    RequestBuilder.refresh(refreshToken: refresh), token: nil)
                let (response, userJSON) = try Self.decodeSession(data)
                // Si por lo que sea no vino refresh, el anterior sigue siendo
                // el último conocido: no se pisa con nada.
                if let newRefresh = response.refreshToken {
                    try keychain.write(newRefresh, for: .refreshToken)
                }
                let tokens = Self.tokens(from: response, userJSON: userJSON, now: clock())
                publish(tokens: tokens)
                return tokens
            } catch APIError.unauthenticated, APIError.sessionRevoked {
                closeLocally()
                throw SessionError.signedOut
            } catch let error as APIError where error.isNetworkError && attempts > 0 {
                continue
            } catch {
                // Red (ya reintentada), servidor caído o respuesta rara: nada
                // de eso dice que la sesión murió. Se conserva el Keychain.
                publish(.offline(last: tokens?.profile))
                throw SessionError.offline
            }
        }
    }

    private func isValid(_ t: TokenPair) -> Bool {
        t.expiresAt.timeIntervalSince(clock()) >= margin
    }

    private func publish(tokens newTokens: TokenPair) {
        tokens = newTokens
        publish(.active(newTokens.profile))
    }

    private func closeLocally() {
        try? keychain.delete(.refreshToken)
        tokens = nil
        publish(.signedOut)
    }

    private func publish(_ state: SessionState) {
        guard state != currentState else { return }
        currentState = state
        continuation.yield(state)
    }

    // MARK: Lectura de la respuesta

    private static func tokens(from r: SessionResponse, userJSON: Data, now: Date) -> TokenPair {
        TokenPair(
            access: r.accessToken, expiresAt: now.addingTimeInterval(TimeInterval(r.expiresIn)), userJSON: userJSON,
            profile: r.user)
    }

    /// Decodifica el sobre y, aparte, recorta el `user` crudo del cuerpo. Si
    /// el recorte no encuentra el objeto, se vuelve a serializar lo decodificado
    /// por `JSONSerialization`: mismas claves, mismos valores.
    private static func decodeSession(_ data: Data) throws -> (SessionResponse, Data) {
        let response: SessionResponse
        do {
            response = try JSONDecoder().decode(Envelope<SessionResponse>.self, from: data).data
        } catch {
            throw APIError.unreadableResponse
        }
        if let raw = JSONSlicer.object(key: "user", inside: "data", at: data) {
            return (response, raw)
        }
        guard let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let data = envelope["data"] as? [String: Any],
            let user = data["user"],
            let userJSON = try? JSONSerialization.data(withJSONObject: user)
        else { throw APIError.unreadableResponse }
        return (response, userJSON)
    }
}

/// Recorta, byte a byte, el valor-objeto de una clave dentro de otro objeto
/// de un JSON. No interpreta nada: solo cuenta llaves y respeta las cadenas.
enum JSONSlicer {
    // Un escáner de bytes: un caso por carácter estructural y un estado que
    // cruza todos. Partirlo en funciones obliga a pasar ese estado de mano en
    // mano y se lee peor que el bucle entero.
    // swiftlint:disable:next cyclomatic_complexity function_body_length
    static func object(key: String, inside parent: String, at data: Data) -> Data? {
        let bytes = [UInt8](data)
        var i = 0
        var depth = 0
        var currentKey: [UInt8] = []
        var awaitingValue = false
        var insideParent = false
        var parentDepth = 0
        let target = Array(key.utf8)
        let parentName = Array(parent.utf8)

        while i < bytes.count {
            let b = bytes[i]
            switch b {
            case UInt8(ascii: "\""):
                guard let end = endOfString(bytes, from: i) else { return nil }
                let content = Array(bytes[(i + 1)..<end])
                // Una cadena seguida de ':' es una clave; si no, es un valor.
                var j = end + 1
                while j < bytes.count, isBlankByte(bytes[j]) { j += 1 }
                if j < bytes.count, bytes[j] == UInt8(ascii: ":") {
                    currentKey = content
                    awaitingValue = true
                    i = j + 1
                    continue
                }
                awaitingValue = false
                i = end + 1
            case UInt8(ascii: "{"):
                if awaitingValue {
                    if depth == 1, currentKey == parentName {
                        insideParent = true
                        parentDepth = 2
                    } else if insideParent, depth == parentDepth, currentKey == target {
                        guard let close = endOfObject(bytes, from: i) else { return nil }
                        return Data(bytes[i...close])
                    }
                }
                awaitingValue = false
                depth += 1
                i += 1
            case UInt8(ascii: "}"):
                depth -= 1
                if insideParent, depth < parentDepth { insideParent = false }
                i += 1
            case UInt8(ascii: "["):
                awaitingValue = false
                depth += 1
                i += 1
            case UInt8(ascii: "]"):
                depth -= 1
                i += 1
            default:
                if !isBlankByte(b) { awaitingValue = false }
                i += 1
            }
        }
        return nil
    }

    private static func isBlankByte(_ b: UInt8) -> Bool {
        b == 0x20 || b == 0x0A || b == 0x0D || b == 0x09
    }

    /// Índice de la comilla que cierra la cadena abierta en `desde`.
    private static func endOfString(_ bytes: [UInt8], from: Int) -> Int? {
        var i = from + 1
        while i < bytes.count {
            if bytes[i] == UInt8(ascii: "\\") {
                i += 2
                continue
            }
            if bytes[i] == UInt8(ascii: "\"") { return i }
            i += 1
        }
        return nil
    }

    /// Índice de la llave que cierra el objeto abierto en `desde`.
    private static func endOfObject(_ bytes: [UInt8], from: Int) -> Int? {
        var i = from
        var level = 0
        while i < bytes.count {
            switch bytes[i] {
            case UInt8(ascii: "\""):
                guard let end = endOfString(bytes, from: i) else { return nil }
                i = end
            case UInt8(ascii: "{"), UInt8(ascii: "["):
                level += 1
            case UInt8(ascii: "}"), UInt8(ascii: "]"):
                level -= 1
                if level == 0 { return i }
            default:
                break
            }
            i += 1
        }
        return nil
    }
}
