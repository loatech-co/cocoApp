import XCTest

@testable import Coco

final class NativeSessionTests: XCTestCase {
    // El `user` tal cual lo manda la API, con claves en un orden que no es el
    // alfabético: si la sesión lo reescribiera, se notaría.
    private static let userJSON =
        #"{"id":7,"email":"ana@coco.co","display_name":null,"role":"owner","status":"active","created_at":"2026-01-01T00:00:00Z"}"#
    private static func sesionJSON(access: String, refresh: String?, expiresIn: Int = 3600) -> String {
        let refreshParte = refresh.map { #","refresh_token":"\#($0)""# } ?? ""
        return
            #"{"data":{"access_token":"\#(access)","expires_in":\#(expiresIn),"user":\#(userJSON)\#(refreshParte)},"meta":{}}"#
    }
    private static let profile = PublicProfile(
        id: 7, email: "ana@coco.co", displayName: nil, role: "owner", status: "active",
        createdAt: "2026-01-01T00:00:00Z")

    /// Un reloj que las pruebas mueven a mano.
    private final class TestClock: @unchecked Sendable {
        private let lock = NSLock()
        private var _ahora = Date(timeIntervalSince1970: 1_800_000_000)
        var now: Date {
            get { lock.withLock { _ahora } }
            set { lock.withLock { _ahora = newValue } }
        }
        func advance(_ s: TimeInterval) { now = now.addingTimeInterval(s) }
    }

    /// Apuntes en orden de lo que pasó: «red» cuando el transporte responde,
    /// «llavero:<valor>» cuando se escribe el refresh.
    private final class AppLog: @unchecked Sendable {
        private let lock = NSLock()
        private var _lineas: [String] = []
        var lineas: [String] { lock.withLock { _lineas } }
        func record(_ l: String) { lock.withLock { _lineas.append(l) } }
    }

    private final class RecordingTransport: Transport, @unchecked Sendable {
        let interno: FakeTransport
        let bitacora: AppLog
        init(_ interno: FakeTransport, bitacora: AppLog) {
            self.interno = interno
            self.bitacora = bitacora
        }
        func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
            // Un respiro para que las llamadas concurrentes lleguen mientras
            // esta sigue en vuelo.
            try await Task.sleep(for: .milliseconds(30))
            bitacora.record("red")
            return try await interno.data(for: request)
        }
    }

    private final class RecordingKeychain: KeychainStore, @unchecked Sendable {
        let interno: InMemoryKeychain
        let bitacora: AppLog
        init(_ interno: InMemoryKeychain, bitacora: AppLog) {
            self.interno = interno
            self.bitacora = bitacora
        }
        func read(_ key: KeychainKey) throws -> String? { try interno.read(key) }
        func write(_ value: String, at key: KeychainKey) throws {
            bitacora.record("llavero:\(value)")
            try interno.write(value, at: key)
        }
        func delete(_ key: KeychainKey) throws { try interno.delete(key) }
    }

    private struct Harness {
        let transport: FakeTransport
        let llavero: InMemoryKeychain
        let clock: TestClock
        let bitacora: AppLog
        let session: NativeSession
    }

    private func arnes(refresh: String? = "r0", replies: [FakeTransport.Reply] = []) -> Harness {
        let transport = FakeTransport(replies)
        let bitacora = AppLog()
        let llavero = InMemoryKeychain(values: refresh.map { [.refreshToken: $0] } ?? [:])
        let clock = TestClock()
        let base = URL(string: "https://api.coco.invalid") ?? URL(fileURLWithPath: "/")
        let api = APIClient(
            configuration: APIConfiguration(base: base),
            transport: RecordingTransport(transport, bitacora: bitacora), version: "0.1.0")
        let session = NativeSession(
            api: api, llavero: RecordingKeychain(llavero, bitacora: bitacora), clock: { clock.now })
        return Harness(transport: transport, llavero: llavero, clock: clock, bitacora: bitacora, session: session)
    }

    private func body(_ r: URLRequest) -> String {
        String(bytes: r.httpBody ?? Data(), encoding: .utf8) ?? ""
    }

    private func rutas(_ t: FakeTransport) -> [String] {
        t.received.compactMap { $0.url?.path() }
    }

    // MARK: Single-flight y orden

    func testDiezLlamadasConcurrentesConElTokenVencidoHacenUnSoloRefresh() async throws {
        let a = arnes(replies: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1"))])
        let tokens = try await withThrowingTaskGroup(of: String.self) { grupo in
            for _ in 0..<10 { grupo.addTask { try await a.session.validAccessToken() } }
            var vistos: [String] = []
            for try await t in grupo { vistos.append(t) }
            return vistos
        }
        XCTAssertEqual(tokens, Array(repeating: "a1", count: 10))
        XCTAssertEqual(rutas(a.transport), ["/api/v1/auth/refresh"])
    }

    func testElRefreshNuevoSeEscribeEnElLlaveroAntesDePublicarElAccess() async throws {
        let a = arnes(replies: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1"))])
        let access = try await a.session.validAccessToken()
        XCTAssertEqual(access, "a1")
        // Al devolver, el llavero ya tiene el nuevo, y lo tuvo justo después
        // de que la red respondiera: no hay instante en que se use un access
        // cuyo refresh no esté guardado.
        XCTAssertEqual(a.llavero.values[.refreshToken], "r1")
        XCTAssertEqual(a.bitacora.lineas, ["red", "llavero:r1"])
        let state = await a.session.state
        XCTAssertEqual(state, .active(Self.profile))
    }

    func testElRefreshVaEnElCuerpoConCabeceraNativa() async throws {
        let a = arnes(replies: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1"))])
        _ = try await a.session.validAccessToken()
        let r = try XCTUnwrap(a.transport.received.first)
        XCTAssertEqual(r.value(forHTTPHeaderField: "X-Coco-Cliente"), "nativo")
        XCTAssertEqual(body(r), #"{"refresh_token":"r0"}"#)
        XCTAssertNil(r.value(forHTTPHeaderField: "Authorization"))
    }

    // MARK: Qué borra el llavero y qué no

    func testUn401EnElRefreshBorraElLlaveroYDejaSinSesion() async {
        let a = arnes(replies: [.http(401, #"{"error":{"code":"NO_AUTENTICADO","message":"La sesión expiró."}}"#)])
        do {
            _ = try await a.session.validAccessToken()
            XCTFail("tenía que fallar")
        } catch {
            XCTAssertEqual(error as? SessionError, .signedOut)
        }
        XCTAssertNil(a.llavero.values[.refreshToken])
        let state = await a.session.state
        XCTAssertEqual(state, .signedOut)
    }

    func testUnTimedOutReintentaUnaVezConElMismoRefreshYSiFallaConservaElLlavero() async {
        let a = arnes(replies: [.failure(URLError(.timedOut)), .failure(URLError(.networkConnectionLost))])
        do {
            _ = try await a.session.validAccessToken()
            XCTFail("tenía que fallar")
        } catch {
            XCTAssertEqual(error as? SessionError, .offline)
        }
        XCTAssertEqual(rutas(a.transport), ["/api/v1/auth/refresh", "/api/v1/auth/refresh"])
        XCTAssertEqual(a.transport.received.map(body), [#"{"refresh_token":"r0"}"#, #"{"refresh_token":"r0"}"#])
        XCTAssertEqual(a.llavero.values[.refreshToken], "r0", "un fallo de red nunca borra el Keychain")
        let state = await a.session.state
        XCTAssertEqual(state, .offline(last: nil))
    }

    func testSiElReintentoResponde200LaSesionSigue() async throws {
        let a = arnes(replies: [
            .failure(URLError(.notConnectedToInternet)), .http(200, Self.sesionJSON(access: "a1", refresh: "r1")),
        ])
        let access = try await a.session.validAccessToken()
        XCTAssertEqual(access, "a1")
        XCTAssertEqual(a.transport.received.count, 2)
        XCTAssertEqual(a.llavero.values[.refreshToken], "r1")
    }

    func testSinConexionConservaElUltimoPerfil() async throws {
        let a = arnes(replies: [
            .http(200, Self.sesionJSON(access: "a1", refresh: "r1", expiresIn: 300)),
            .failure(URLError(.timedOut)), .failure(URLError(.timedOut)),
        ])
        _ = try await a.session.validAccessToken()
        a.clock.advance(250)  // quedan 50 s: hay que renovar
        _ = try? await a.session.validAccessToken()
        let state = await a.session.state
        XCTAssertEqual(state, .offline(last: Self.profile))
        XCTAssertEqual(a.llavero.values[.refreshToken], "r1")
    }

    func testRestaurarSinRefreshNoLlamaALaRed() async {
        let a = arnes(refresh: nil)
        await a.session.restore()
        let state = await a.session.state
        XCTAssertEqual(state, .signedOut)
        XCTAssertTrue(a.transport.received.isEmpty)
    }

    func testRestaurarConRefreshRenueva() async {
        let a = arnes(replies: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1"))])
        await a.session.restore()
        let state = await a.session.state
        XCTAssertEqual(state, .active(Self.profile))
        XCTAssertEqual(a.llavero.values[.refreshToken], "r1")
    }

    // MARK: Login

    func testEntrarMandaCabeceraNativaYGuardaElRefresh() async throws {
        let a = arnes(refresh: nil, replies: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1"))])
        let profile = try await a.session.signIn(email: "ana@coco.co", password: "secreta")
        XCTAssertEqual(profile, Self.profile)
        let r = try XCTUnwrap(a.transport.received.first)
        XCTAssertEqual(r.url?.path(), "/api/v1/auth/login")
        XCTAssertEqual(r.value(forHTTPHeaderField: "X-Coco-Cliente"), "nativo")
        XCTAssertEqual(body(r), #"{"email":"ana@coco.co","password":"secreta"}"#)
        XCTAssertEqual(a.llavero.values[.refreshToken], "r1")
        XCTAssertEqual(a.llavero.writes.map(\.1), ["r1"])
        let state = await a.session.state
        XCTAssertEqual(state, .active(Self.profile))
        // Y el access ya sirve sin tocar la red otra vez.
        let access = try await a.session.validAccessToken()
        XCTAssertEqual(access, "a1")
        XCTAssertEqual(a.transport.received.count, 1)
    }

    func testEntrarConCredencialesMalasNoTocaElLlavero() async {
        let a = arnes(
            refresh: nil,
            replies: [.http(401, #"{"error":{"code":"NO_AUTENTICADO","message":"Credenciales inválidas."}}"#)])
        do {
            _ = try await a.session.signIn(email: "ana@coco.co", password: "mal")
            XCTFail("tenía que fallar")
        } catch {
            XCTAssertEqual(error as? APIError, .unauthenticated)
        }
        XCTAssertTrue(a.llavero.writes.isEmpty)
    }

    func testLasPeticionesQueNoSonDeAuthNoLlevanLaCabeceraNativa() async throws {
        let a = arnes(replies: [.http(200, #"{"data":[],"meta":{}}"#)])
        let base = URL(string: "https://api.coco.invalid") ?? URL(fileURLWithPath: "/")
        let api = APIClient(
            configuration: APIConfiguration(base: base), transport: a.transport, version: "0.1.0")
        let _: [TreeNode] = try await api.send(RequestBuilder.categories(), token: "a1")
        let r = try XCTUnwrap(a.transport.received.first)
        XCTAssertNil(r.value(forHTTPHeaderField: "X-Coco-Cliente"))
        XCTAssertEqual(r.value(forHTTPHeaderField: "Authorization"), "Bearer a1")
    }

    // MARK: Para la web

    func testSesionParaLaWebNoLlevaRefreshYElUserEsByteAByteElQueLlego() async throws {
        let a = arnes(replies: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1", expiresIn: 3600))])
        _ = try await a.session.validAccessToken()
        a.clock.advance(1000)
        let s = try await a.session.webSession()
        XCTAssertEqual(s.accessToken, "a1")
        XCTAssertEqual(s.expiresIn, 2600)
        XCTAssertGreaterThanOrEqual(s.expiresIn, 120)
        XCTAssertEqual(s.userJSON, Data(Self.userJSON.utf8))
        let dic = try s.asDictionary()
        XCTAssertNil(dic["refresh_token"])
        XCTAssertEqual(Set(dic.keys), ["access_token", "expires_in", "user"])
        XCTAssertEqual((dic["user"] as? [String: Any])?["created_at"] as? String, "2026-01-01T00:00:00Z")
        XCTAssertEqual(a.transport.received.count, 1)
    }

    // MARK: Margen

    func testConCienSegundosRestantesRenuevaYConCientoTreintaNo() async throws {
        let a = arnes(replies: [
            .http(200, Self.sesionJSON(access: "a1", refresh: "r1", expiresIn: 3600)),
            .http(200, Self.sesionJSON(access: "a2", refresh: "r2", expiresIn: 3600)),
        ])
        _ = try await a.session.validAccessToken()
        a.clock.advance(3470)  // quedan 130
        let sigue = try await a.session.validAccessToken()
        XCTAssertEqual(sigue, "a1")
        XCTAssertEqual(a.transport.received.count, 1)
        a.clock.advance(30)  // quedan 100
        let nuevo = try await a.session.validAccessToken()
        XCTAssertEqual(nuevo, "a2")
        XCTAssertEqual(a.transport.received.count, 2)
        XCTAssertEqual(body(a.transport.received[1]), #"{"refresh_token":"r1"}"#)
    }

    func testRenovarAhoraRenuevaAunqueElTokenParezcaVigente() async throws {
        let a = arnes(replies: [
            .http(200, Self.sesionJSON(access: "a1", refresh: "r1")),
            .http(200, Self.sesionJSON(access: "a2", refresh: "r2")),
        ])
        _ = try await a.session.validAccessToken()
        try await a.session.refreshNow()
        let access = try await a.session.validAccessToken()
        XCTAssertEqual(access, "a2")
        XCTAssertEqual(a.transport.received.count, 2)
    }

    // MARK: Salir

    func testSalirLlamaALogoutConElRefreshYBorraElLlaveroAunqueLaRedFalle() async {
        let a = arnes(replies: [.failure(URLError(.notConnectedToInternet))])
        await a.session.signOut()
        let r = a.transport.received.first
        XCTAssertEqual(r?.url?.path(), "/api/v1/auth/logout")
        XCTAssertEqual(r?.value(forHTTPHeaderField: "X-Coco-Cliente"), "nativo")
        XCTAssertEqual(r.map(body), #"{"refresh_token":"r0"}"#)
        XCTAssertNil(a.llavero.values[.refreshToken])
        let state = await a.session.state
        XCTAssertEqual(state, .signedOut)
    }

    func testDescartarNoLlamaANadaYBorraElLlavero() async {
        let a = arnes()
        await a.session.discard()
        XCTAssertTrue(a.transport.received.isEmpty)
        XCTAssertNil(a.llavero.values[.refreshToken])
        let state = await a.session.state
        XCTAssertEqual(state, .signedOut)
    }

    func testLosCambiosDeEstadoSePublican() async throws {
        let a = arnes(replies: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1"))])
        let recogida = Task { () -> [SessionState] in
            var vistos: [SessionState] = []
            for await e in a.session.changes {
                vistos.append(e)
                if vistos.count == 2 { break }
            }
            return vistos
        }
        await a.session.restore()
        await a.session.discard()
        let vistos = await recogida.value
        XCTAssertEqual(vistos, [.active(Self.profile), .signedOut])
    }

    // MARK: El recorte del JSON

    func testRecorteDeJSONRespetaCadenasConLlaves() {
        let json =
            #"{"meta":{"user":{"no":"este"}},"data":{"nota":"} {","user":{"a":"{\"x\":1}","b":[1,{"c":2}]},"otro":{}}}"#
        let crudo = JSONSlicer.object(key: "user", dentroDe: "data", at: Data(json.utf8))
        XCTAssertEqual(crudo.flatMap { String(bytes: $0, encoding: .utf8) }, #"{"a":"{\"x\":1}","b":[1,{"c":2}]}"#)
    }
}
