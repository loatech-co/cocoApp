import Foundation

/// La única dueña del refresh token y el ÚNICO rotador de la familia de
/// Supabase en el teléfono. La cola, el webview, los intents y la tarea de
/// fondo pasan todos por aquí; dos `/auth/refresh` a la vez dispararían la
/// detección de reuso de GoTrue y matarían la familia entera.
final actor NativeSession: Session {
    private struct TokenPair {
        var access: String
        var expiraEn: Date
        /// El `user` tal como llegó: la web lo recibe sin reescribir una clave.
        var userJSON: Data
        var perfil: PublicProfile
    }

    private let api: APIClient
    private let llavero: KeychainStore
    private let reloj: @Sendable () -> Date
    /// Mayor que los 60 s de la web: lo que la web recibe por el puente no
    /// debe disparar nunca su propio bucle de renovación.
    private let margen: TimeInterval

    private var tokens: TokenPair?
    /// El single-flight: quien llegue mientras hay una renovación en vuelo
    /// espera a ESA, no abre otra.
    private var renovacionEnVuelo: Task<TokenPair, Error>?
    private(set) var estadoActual: SessionState = .cargando

    nonisolated let cambios: AsyncStream<SessionState>
    private nonisolated let continuacion: AsyncStream<SessionState>.Continuation

    init(
        api: APIClient, llavero: KeychainStore, reloj: @Sendable @escaping () -> Date = Date.init, margen: TimeInterval = 120
    ) {
        self.api = api
        self.llavero = llavero
        self.reloj = reloj
        self.margen = margen
        let (flujo, cont) = AsyncStream.makeStream(of: SessionState.self)
        cambios = flujo
        continuacion = cont
    }

    var estado: SessionState { estadoActual }

    // MARK: Entrar y restaurar

    /// Al arrancar: si hay refresh en el Keychain se renueva; si no, no hay
    /// sesión. Un fallo de red deja el Keychain intacto y pasa a sin conexión.
    func restaurar() async {
        guard let refresh = try? llavero.leer(.refreshToken), !refresh.isEmpty else {
            publicar(.sinSesion)
            return
        }
        // Los errores ya dejaron el estado que toca (sinSesion o sinConexion).
        _ = try? await renovarCompartida()
    }

    func entrar(correo: String, contrasena: String) async throws -> PublicProfile {
        let datos = try await api.enviarCrudo(
            RequestBuilder.login(correo: correo, contrasena: contrasena), token: nil)
        let (respuesta, userJSON) = try Self.leerSesion(datos)
        guard let refresh = respuesta.refreshToken else { throw APIError.respuestaIlegible }
        try llavero.escribir(refresh, en: .refreshToken)
        publicar(tokens: Self.tokens(de: respuesta, userJSON: userJSON, ahora: reloj()))
        return respuesta.user
    }

    // MARK: Access token

    func accessTokenVigente() async throws -> String {
        if let tokens, vigente(tokens) { return tokens.access }
        return try await renovarCompartida().access
    }

    /// Tras un 401 inesperado: renueva aunque al reloj le parezca vigente.
    func renovarAhora() async throws {
        _ = try await renovarCompartida()
    }

    func sesionParaLaWeb() async throws -> WebSession {
        let access = try await accessTokenVigente()
        guard let tokens, tokens.access == access else { throw SessionError.sinSesion }
        let restantes = Int(tokens.expiraEn.timeIntervalSince(reloj()).rounded(.down))
        return WebSession(accessToken: access, expiresIn: restantes, userJSON: tokens.userJSON)
    }

    // MARK: Salir

    /// Avisa al servidor con el refresh y borra el Keychain pase lo que pase:
    /// quien pulsó «salir» no vuelve a ver su sesión por un fallo de red.
    func salir() async {
        renovacionEnVuelo?.cancel()
        if let refresh = try? llavero.leer(.refreshToken), !refresh.isEmpty {
            try? await api.enviarSinCuerpo(RequestBuilder.logout(refreshToken: refresh), token: nil)
        }
        cerrarLocalmente()
    }

    /// Solo local: la web avisó que el servidor ya cerró la familia.
    func descartar() async {
        renovacionEnVuelo?.cancel()
        cerrarLocalmente()
    }

    // MARK: Renovación

    private func renovarCompartida() async throws -> TokenPair {
        if let enVuelo = renovacionEnVuelo {
            return try await enVuelo.value
        }
        let tarea = Task { try await self.renovar(conReintentoDeRed: true) }
        renovacionEnVuelo = tarea
        defer { renovacionEnVuelo = nil }
        return try await tarea.value
    }

    /// Orden: llamada → escribir el refresh nuevo en el llavero → publicar.
    /// Un `URLError` NUNCA borra el Keychain: reintenta una vez con el mismo
    /// refresh (dentro del intervalo de reuso de GoTrue devuelve la misma
    /// sesión) y, si vuelve a fallar, conserva todo y pasa a sin conexión.
    /// SOLO un 401 real borra el Keychain.
    private func renovar(conReintentoDeRed: Bool) async throws -> TokenPair {
        guard let refresh = try? llavero.leer(.refreshToken), !refresh.isEmpty else {
            cerrarLocalmente()
            throw SessionError.sinSesion
        }
        var intentos = conReintentoDeRed ? 2 : 1
        while true {
            intentos -= 1
            do {
                let datos = try await api.enviarCrudo(
                    RequestBuilder.refresh(refreshToken: refresh), token: nil)
                let (respuesta, userJSON) = try Self.leerSesion(datos)
                // Si por lo que sea no vino refresh, el anterior sigue siendo
                // el último conocido: no se pisa con nada.
                if let nuevo = respuesta.refreshToken {
                    try llavero.escribir(nuevo, en: .refreshToken)
                }
                let tokens = Self.tokens(de: respuesta, userJSON: userJSON, ahora: reloj())
                publicar(tokens: tokens)
                return tokens
            } catch APIError.noAutenticado {
                cerrarLocalmente()
                throw SessionError.sinSesion
            } catch let error as APIError where error.esDeRed && intentos > 0 {
                continue
            } catch {
                // Red (ya reintentada), servidor caído o respuesta rara: nada
                // de eso dice que la sesión murió. Se conserva el Keychain.
                publicar(.sinConexion(ultima: tokens?.perfil))
                throw SessionError.sinConexion
            }
        }
    }

    private func vigente(_ t: TokenPair) -> Bool {
        t.expiraEn.timeIntervalSince(reloj()) >= margen
    }

    private func publicar(tokens nuevos: TokenPair) {
        tokens = nuevos
        publicar(.activa(nuevos.perfil))
    }

    private func cerrarLocalmente() {
        try? llavero.borrar(.refreshToken)
        tokens = nil
        publicar(.sinSesion)
    }

    private func publicar(_ estado: SessionState) {
        guard estado != estadoActual else { return }
        estadoActual = estado
        continuacion.yield(estado)
    }

    // MARK: Lectura de la respuesta

    private static func tokens(de r: SessionResponse, userJSON: Data, ahora: Date) -> TokenPair {
        TokenPair(
            access: r.accessToken, expiraEn: ahora.addingTimeInterval(TimeInterval(r.expiresIn)), userJSON: userJSON,
            perfil: r.user)
    }

    /// Decodifica el sobre y, aparte, recorta el `user` crudo del cuerpo. Si
    /// el recorte no encuentra el objeto, se vuelve a serializar lo decodificado
    /// por `JSONSerialization`: mismas claves, mismos valores.
    private static func leerSesion(_ datos: Data) throws -> (SessionResponse, Data) {
        let respuesta: SessionResponse
        do {
            respuesta = try JSONDecoder().decode(Envelope<SessionResponse>.self, from: datos).data
        } catch {
            throw APIError.respuestaIlegible
        }
        if let crudo = JSONSlicer.objeto(clave: "user", dentroDe: "data", en: datos) {
            return (respuesta, crudo)
        }
        guard let sobre = try? JSONSerialization.jsonObject(with: datos) as? [String: Any],
            let data = sobre["data"] as? [String: Any],
            let user = data["user"],
            let userJSON = try? JSONSerialization.data(withJSONObject: user)
        else { throw APIError.respuestaIlegible }
        return (respuesta, userJSON)
    }
}

/// Recorta, byte a byte, el valor-objeto de una clave dentro de otro objeto
/// de un JSON. No interpreta nada: solo cuenta llaves y respeta las cadenas.
enum JSONSlicer {
    static func objeto(clave: String, dentroDe padre: String, en datos: Data) -> Data? {
        let bytes = [UInt8](datos)
        var i = 0
        var profundidad = 0
        var claveActual: [UInt8] = []
        var esperandoValor = false
        var dentroDelPadre = false
        var profundidadDelPadre = 0
        let objetivo = Array(clave.utf8)
        let nombreDelPadre = Array(padre.utf8)

        while i < bytes.count {
            let b = bytes[i]
            switch b {
            case UInt8(ascii: "\""):
                guard let fin = finDeCadena(bytes, desde: i) else { return nil }
                let contenido = Array(bytes[(i + 1)..<fin])
                // Una cadena seguida de ':' es una clave; si no, es un valor.
                var j = fin + 1
                while j < bytes.count, esBlanco(bytes[j]) { j += 1 }
                if j < bytes.count, bytes[j] == UInt8(ascii: ":") {
                    claveActual = contenido
                    esperandoValor = true
                    i = j + 1
                    continue
                }
                esperandoValor = false
                i = fin + 1
            case UInt8(ascii: "{"):
                if esperandoValor {
                    if profundidad == 1, claveActual == nombreDelPadre {
                        dentroDelPadre = true
                        profundidadDelPadre = 2
                    } else if dentroDelPadre, profundidad == profundidadDelPadre, claveActual == objetivo {
                        guard let cierre = finDeObjeto(bytes, desde: i) else { return nil }
                        return Data(bytes[i...cierre])
                    }
                }
                esperandoValor = false
                profundidad += 1
                i += 1
            case UInt8(ascii: "}"):
                profundidad -= 1
                if dentroDelPadre, profundidad < profundidadDelPadre { dentroDelPadre = false }
                i += 1
            case UInt8(ascii: "["):
                esperandoValor = false
                profundidad += 1
                i += 1
            case UInt8(ascii: "]"):
                profundidad -= 1
                i += 1
            default:
                if !esBlanco(b) { esperandoValor = false }
                i += 1
            }
        }
        return nil
    }

    private static func esBlanco(_ b: UInt8) -> Bool {
        b == 0x20 || b == 0x0A || b == 0x0D || b == 0x09
    }

    /// Índice de la comilla que cierra la cadena abierta en `desde`.
    private static func finDeCadena(_ bytes: [UInt8], desde: Int) -> Int? {
        var i = desde + 1
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
    private static func finDeObjeto(_ bytes: [UInt8], desde: Int) -> Int? {
        var i = desde
        var nivel = 0
        while i < bytes.count {
            switch bytes[i] {
            case UInt8(ascii: "\""):
                guard let fin = finDeCadena(bytes, desde: i) else { return nil }
                i = fin
            case UInt8(ascii: "{"), UInt8(ascii: "["):
                nivel += 1
            case UInt8(ascii: "}"), UInt8(ascii: "]"):
                nivel -= 1
                if nivel == 0 { return i }
            default:
                break
            }
            i += 1
        }
        return nil
    }
}
