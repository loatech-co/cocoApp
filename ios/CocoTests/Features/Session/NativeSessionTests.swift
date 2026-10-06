import XCTest

@testable import Coco

final class NativeSessionTests: XCTestCase {
    // El `user` tal cual lo manda la API, con claves en un orden que no es el
    // alfabético: si la sesión lo reescribiera, se notaría.
    private static let userJSON =
        #"{"id":7,"email":"ana@coco.co","displayName":null,"role":"owner","status":"active","createdAt":"2026-01-01T00:00:00Z"}"#
    private static func sessionJSON(access: String, refresh: String?, expiresIn: Int = 3600) -> String {
        let refreshPart = refresh.map { #","refreshToken":"\#($0)""# } ?? ""
        return
            #"{"data":{"accessToken":"\#(access)","expiresIn":\#(expiresIn),"user":\#(userJSON)\#(refreshPart)},"meta":{}}"#
    }
    private static let profile = PublicProfile(
        id: 7, email: "ana@coco.co", displayName: nil, role: "owner", status: "active",
        createdAt: "2026-01-01T00:00:00Z")

    /// Un reloj que las pruebas mueven a mano.
    /// `@unchecked Sendable`: doble de pruebas. Lo que cambia mientras la prueba
    /// corre va bajo `lock`; lo que se configura se escribe antes de usarlo.
    private final class TestClock: @unchecked Sendable {
        private let lock = NSLock()
        private var _now = Date(timeIntervalSince1970: 1_800_000_000)
        var now: Date {
            get { lock.withLock { _now } }
            set { lock.withLock { _now = newValue } }
        }
        func advance(_ s: TimeInterval) { now = now.addingTimeInterval(s) }
    }

    /// Apuntes en orden de lo que pasó: «red» cuando el transporte responde,
    /// «llavero:<valor>» cuando se escribe el refresh.
    /// `@unchecked Sendable`: doble de pruebas. Lo que cambia mientras la prueba
    /// corre va bajo `lock`; lo que se configura se escribe antes de usarlo.
    private final class AppLog: @unchecked Sendable {
        private let lock = NSLock()
        private var _lines: [String] = []
        var lines: [String] { lock.withLock { _lines } }
        func record(_ l: String) { lock.withLock { _lines.append(l) } }
    }

    private final class RecordingTransport: Transport {
        let inner: FakeTransport
        let log: AppLog
        init(_ inner: FakeTransport, log: AppLog) {
            self.inner = inner
            self.log = log
        }
        func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
            // Un respiro para que las llamadas concurrentes lleguen mientras
            // esta sigue en vuelo.
            try await Task.sleep(for: .milliseconds(30))
            log.record("red")
            return try await inner.data(for: request)
        }
    }

    private final class RecordingKeychain: KeychainStore {
        let inner: InMemoryKeychain
        let log: AppLog
        init(_ inner: InMemoryKeychain, log: AppLog) {
            self.inner = inner
            self.log = log
        }
        func read(_ key: KeychainKey) throws -> String? { try inner.read(key) }
        func write(_ value: String, for key: KeychainKey) throws {
            log.record("llavero:\(value)")
            try inner.write(value, for: key)
        }
        func delete(_ key: KeychainKey) throws { try inner.delete(key) }
    }

    private struct Harness {
        let transport: FakeTransport
        let keychain: InMemoryKeychain
        let clock: TestClock
        let log: AppLog
        let session: NativeSession
    }

    private func harness(refresh: String? = "r0", replies: [FakeTransport.Reply] = []) -> Harness {
        let transport = FakeTransport(replies)
        let log = AppLog()
        let keychain = InMemoryKeychain(values: refresh.map { [.refreshToken: $0] } ?? [:])
        let clock = TestClock()
        let base = URL(string: "https://api.coco.invalid") ?? URL(fileURLWithPath: "/")
        let api = APIClient(
            configuration: APIConfiguration(base: base),
            transport: RecordingTransport(transport, log: log), version: "0.1.0")
        let session = NativeSession(
            api: api, keychain: RecordingKeychain(keychain, log: log), clock: { clock.now })
        return Harness(transport: transport, keychain: keychain, clock: clock, log: log, session: session)
    }

    private func body(_ r: URLRequest) -> String {
        String(bytes: r.httpBody ?? Data(), encoding: .utf8) ?? ""
    }

    private func paths(_ t: FakeTransport) -> [String] {
        t.received.compactMap { $0.url?.path() }
    }

    // MARK: Single-flight y orden

    func testTenConcurrentCallsWithAnExpiredTokenMakeASingleRefresh() async throws {
        let a = harness(replies: [.http(200, Self.sessionJSON(access: "a1", refresh: "r1"))])
        let tokens = try await withThrowingTaskGroup(of: String.self) { group in
            for _ in 0..<10 { group.addTask { try await a.session.validAccessToken() } }
            var seen: [String] = []
            for try await t in group { seen.append(t) }
            return seen
        }
        XCTAssertEqual(tokens, Array(repeating: "a1", count: 10))
        XCTAssertEqual(paths(a.transport), ["/api/v2/auth/refresh"])
    }

    func testTheNewRefreshIsWrittenToTheKeychainBeforePublishingTheAccess() async throws {
        let a = harness(replies: [.http(200, Self.sessionJSON(access: "a1", refresh: "r1"))])
        let access = try await a.session.validAccessToken()
        XCTAssertEqual(access, "a1")
        // Al devolver, el llavero ya tiene el nuevo, y lo tuvo justo después
        // de que la red respondiera: no hay instante en que se use un access
        // cuyo refresh no esté guardado.
        XCTAssertEqual(a.keychain.values[.refreshToken], "r1")
        XCTAssertEqual(a.log.lines, ["red", "llavero:r1"])
        let state = await a.session.state
        XCTAssertEqual(state, .active(Self.profile))
    }

    func testTheRefreshGoesInTheBodyWithTheNativeHeader() async throws {
        let a = harness(replies: [.http(200, Self.sessionJSON(access: "a1", refresh: "r1"))])
        _ = try await a.session.validAccessToken()
        let r = try XCTUnwrap(a.transport.received.first)
        XCTAssertEqual(r.value(forHTTPHeaderField: "X-Coco-Client"), "native")
        XCTAssertEqual(body(r), #"{"refreshToken":"r0"}"#)
        XCTAssertNil(r.value(forHTTPHeaderField: "Authorization"))
    }

    // MARK: Qué borra el llavero y qué no

    func testA401OnRefreshClearsTheKeychainAndSignsOut() async {
        let a = harness(replies: [
            .http(
                401,
                #"{"type":"https://dev-cocoapp.viteri.me/problems/session_expired","title":"La sesión expiró","status":401,"detail":"La sesión expiró.","code":"session_expired"}"#
            )
        ])
        do {
            _ = try await a.session.validAccessToken()
            XCTFail("tenía que fallar")
        } catch {
            XCTAssertEqual(error as? SessionError, .signedOut)
        }
        XCTAssertNil(a.keychain.values[.refreshToken])
        let state = await a.session.state
        XCTAssertEqual(state, .signedOut)
    }

    func testATimeoutRetriesOnceWithTheSameRefreshAndIfItFailsKeepsTheKeychain() async {
        let a = harness(replies: [.failure(URLError(.timedOut)), .failure(URLError(.networkConnectionLost))])
        do {
            _ = try await a.session.validAccessToken()
            XCTFail("tenía que fallar")
        } catch {
            XCTAssertEqual(error as? SessionError, .offline)
        }
        XCTAssertEqual(paths(a.transport), ["/api/v2/auth/refresh", "/api/v2/auth/refresh"])
        XCTAssertEqual(a.transport.received.map(body), [#"{"refreshToken":"r0"}"#, #"{"refreshToken":"r0"}"#])
        XCTAssertEqual(a.keychain.values[.refreshToken], "r0", "un fallo de red nunca borra el Keychain")
        let state = await a.session.state
        XCTAssertEqual(state, .offline(last: nil))
    }

    func testIfTheRetryAnswers200TheSessionStays() async throws {
        let a = harness(replies: [
            .failure(URLError(.notConnectedToInternet)), .http(200, Self.sessionJSON(access: "a1", refresh: "r1")),
        ])
        let access = try await a.session.validAccessToken()
        XCTAssertEqual(access, "a1")
        XCTAssertEqual(a.transport.received.count, 2)
        XCTAssertEqual(a.keychain.values[.refreshToken], "r1")
    }

    func testOfflineKeepsTheLastProfile() async throws {
        let a = harness(replies: [
            .http(200, Self.sessionJSON(access: "a1", refresh: "r1", expiresIn: 300)),
            .failure(URLError(.timedOut)), .failure(URLError(.timedOut)),
        ])
        _ = try await a.session.validAccessToken()
        a.clock.advance(250)  // quedan 50 s: hay que renovar
        _ = try? await a.session.validAccessToken()
        let state = await a.session.state
        XCTAssertEqual(state, .offline(last: Self.profile))
        XCTAssertEqual(a.keychain.values[.refreshToken], "r1")
    }

    func testRestoreWithoutRefreshDoesNotHitTheNetwork() async {
        let a = harness(refresh: nil)
        await a.session.restore()
        let state = await a.session.state
        XCTAssertEqual(state, .signedOut)
        XCTAssertTrue(a.transport.received.isEmpty)
    }

    func testRestoreWithRefreshRefreshes() async {
        let a = harness(replies: [.http(200, Self.sessionJSON(access: "a1", refresh: "r1"))])
        await a.session.restore()
        let state = await a.session.state
        XCTAssertEqual(state, .active(Self.profile))
        XCTAssertEqual(a.keychain.values[.refreshToken], "r1")
    }

    // MARK: Login

    func testSignInSendsTheNativeHeaderAndSavesTheRefresh() async throws {
        let a = harness(refresh: nil, replies: [.http(200, Self.sessionJSON(access: "a1", refresh: "r1"))])
        let profile = try await a.session.signIn(email: "ana@coco.co", password: "secreta")
        XCTAssertEqual(profile, Self.profile)
        let r = try XCTUnwrap(a.transport.received.first)
        XCTAssertEqual(r.url?.path(), "/api/v2/auth/login")
        XCTAssertEqual(r.value(forHTTPHeaderField: "X-Coco-Client"), "native")
        XCTAssertEqual(body(r), #"{"email":"ana@coco.co","password":"secreta"}"#)
        XCTAssertEqual(a.keychain.values[.refreshToken], "r1")
        XCTAssertEqual(a.keychain.writes.map(\.1), ["r1"])
        let state = await a.session.state
        XCTAssertEqual(state, .active(Self.profile))
        // Y el access ya sirve sin tocar la red otra vez.
        let access = try await a.session.validAccessToken()
        XCTAssertEqual(access, "a1")
        XCTAssertEqual(a.transport.received.count, 1)
    }

    func testSignInWithBadCredentialsDoesNotTouchTheKeychain() async {
        let a = harness(
            refresh: nil,
            replies: [
                .http(
                    401,
                    #"{"status":401,"title":"Credenciales inválidas","detail":"Credenciales inválidas.","code":"invalid_credentials"}"#
                )
            ])
        do {
            _ = try await a.session.signIn(email: "ana@coco.co", password: "mal")
            XCTFail("tenía que fallar")
        } catch {
            guard case .rejected(let problem)? = error as? APIError else { return XCTFail("\(error)") }
            XCTAssertEqual(problem.code, .invalidCredentials)
        }
        XCTAssertTrue(a.keychain.writes.isEmpty)
    }

    func testNonAuthRequestsDoNotCarryTheNativeHeader() async throws {
        let a = harness(replies: [.http(200, #"{"data":[],"meta":{}}"#)])
        let base = URL(string: "https://api.coco.invalid") ?? URL(fileURLWithPath: "/")
        let api = APIClient(
            configuration: APIConfiguration(base: base), transport: a.transport, version: "0.1.0")
        let _: [TreeNode] = try await api.send(RequestBuilder.categories(page: 1), token: "a1")
        let r = try XCTUnwrap(a.transport.received.first)
        XCTAssertNil(r.value(forHTTPHeaderField: "X-Coco-Client"))
        XCTAssertEqual(r.value(forHTTPHeaderField: "Authorization"), "Bearer a1")
    }

    // MARK: Para la web

    func testWebSessionHasNoRefreshAndTheUserIsByteForByteWhatArrived() async throws {
        let a = harness(replies: [.http(200, Self.sessionJSON(access: "a1", refresh: "r1", expiresIn: 3600))])
        _ = try await a.session.validAccessToken()
        a.clock.advance(1000)
        let s = try await a.session.webSession()
        XCTAssertEqual(s.accessToken, "a1")
        XCTAssertEqual(s.expiresIn, 2600)
        XCTAssertGreaterThanOrEqual(s.expiresIn, 120)
        XCTAssertEqual(s.userJSON, Data(Self.userJSON.utf8))
        let dict = try s.asDictionary()
        XCTAssertNil(dict["refresh_token"])
        XCTAssertEqual(Set(dict.keys), ["accessToken", "expiresIn", "user"])
        // El perfil le llega a la web tal cual lo dio la API.
        let user = try XCTUnwrap(dict["user"] as? [String: Any])
        XCTAssertEqual(user["createdAt"] as? String, "2026-01-01T00:00:00Z")
        XCTAssertNil(user["created_at"])
        XCTAssertEqual(a.transport.received.count, 1)
    }

    // MARK: Margen

    func testWithOneHundredSecondsLeftRefreshesAndWithOneHundredThirtyDoesNot() async throws {
        let a = harness(replies: [
            .http(200, Self.sessionJSON(access: "a1", refresh: "r1", expiresIn: 3600)),
            .http(200, Self.sessionJSON(access: "a2", refresh: "r2", expiresIn: 3600)),
        ])
        _ = try await a.session.validAccessToken()
        a.clock.advance(3470)  // quedan 130
        let stillActive = try await a.session.validAccessToken()
        XCTAssertEqual(stillActive, "a1")
        XCTAssertEqual(a.transport.received.count, 1)
        a.clock.advance(30)  // quedan 100
        let newRefresh = try await a.session.validAccessToken()
        XCTAssertEqual(newRefresh, "a2")
        XCTAssertEqual(a.transport.received.count, 2)
        XCTAssertEqual(body(a.transport.received[1]), #"{"refreshToken":"r1"}"#)
    }

    func testRefreshNowRefreshesEvenIfTheTokenLooksValid() async throws {
        let a = harness(replies: [
            .http(200, Self.sessionJSON(access: "a1", refresh: "r1")),
            .http(200, Self.sessionJSON(access: "a2", refresh: "r2")),
        ])
        _ = try await a.session.validAccessToken()
        try await a.session.refreshNow()
        let access = try await a.session.validAccessToken()
        XCTAssertEqual(access, "a2")
        XCTAssertEqual(a.transport.received.count, 2)
    }

    // MARK: Salir

    func testSignOutCallsLogoutWithTheRefreshAndClearsTheKeychainEvenIfTheNetworkFails() async {
        let a = harness(replies: [.failure(URLError(.notConnectedToInternet))])
        await a.session.signOut()
        let r = a.transport.received.first
        XCTAssertEqual(r?.url?.path(), "/api/v2/auth/logout")
        XCTAssertEqual(r?.value(forHTTPHeaderField: "X-Coco-Client"), "native")
        XCTAssertEqual(r.map(body), #"{"refreshToken":"r0"}"#)
        XCTAssertNil(a.keychain.values[.refreshToken])
        let state = await a.session.state
        XCTAssertEqual(state, .signedOut)
    }

    func testDiscardCallsNothingAndClearsTheKeychain() async {
        let a = harness()
        await a.session.discard()
        XCTAssertTrue(a.transport.received.isEmpty)
        XCTAssertNil(a.keychain.values[.refreshToken])
        let state = await a.session.state
        XCTAssertEqual(state, .signedOut)
    }

    func testStateChangesArePublished() async throws {
        let a = harness(replies: [.http(200, Self.sessionJSON(access: "a1", refresh: "r1"))])
        let collected = Task { () -> [SessionState] in
            var seen: [SessionState] = []
            for await e in a.session.changes {
                seen.append(e)
                if seen.count == 2 { break }
            }
            return seen
        }
        await a.session.restore()
        await a.session.discard()
        let seen = await collected.value
        XCTAssertEqual(seen, [.active(Self.profile), .signedOut])
    }

    // MARK: El recorte del JSON

    func testJSONSlicingRespectsStringsWithBraces() {
        let json =
            #"{"meta":{"user":{"no":"este"}},"data":{"nota":"} {","user":{"a":"{\"x\":1}","b":[1,{"c":2}]},"otro":{}}}"#
        let raw = JSONSlicer.object(key: "user", inside: "data", at: Data(json.utf8))
        XCTAssertEqual(raw.flatMap { String(bytes: $0, encoding: .utf8) }, #"{"a":"{\"x\":1}","b":[1,{"c":2}]}"#)
    }
}
