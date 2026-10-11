import Security
import XCTest

@testable import Coco

/// Signing in, what the web receives and the cut of the raw `user`.
final class NativeSessionLoginTests: NativeSessionTestCase {
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
        // And the access token already works without touching the network again.
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
            XCTFail("it had to fail")
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

    // MARK: For the web

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
        // The profile reaches the web just as the API gave it.
        let user = try XCTUnwrap(dict["user"] as? [String: Any])
        XCTAssertEqual(user["createdAt"] as? String, "2026-01-01T00:00:00Z")
        XCTAssertNil(user["created_at"])
        XCTAssertEqual(a.transport.received.count, 1)
    }

    // MARK: Cutting the JSON

    func testJSONSlicingRespectsStringsWithBraces() {
        let json =
            #"{"meta":{"user":{"no":"este"}},"data":{"nota":"} {","user":{"a":"{\"x\":1}","b":[1,{"c":2}]},"otro":{}}}"#
        let raw = JSONSlicer.object(key: "user", inside: "data", at: Data(json.utf8))
        XCTAssertEqual(raw.flatMap { String(bytes: $0, encoding: .utf8) }, #"{"a":"{\"x\":1}","b":[1,{"c":2}]}"#)
    }

    // MARK: After an unsaved rotation

    /// A refresh whose rotated token the Keychain refused to write, then a sign-in: the
    /// new family starts clean and the next refresh uses what the sign-in wrote, not
    /// the token the old family left in memory.
    func testSignInDropsTheUnsavedTokenOfThePreviousFamily() async throws {
        let a = harness(replies: [
            .http(200, Self.sessionJSON(access: "a1", refresh: "r1")),
            .http(200, Self.sessionJSON(access: "a2", refresh: "r2")),
            .http(200, Self.sessionJSON(access: "a3", refresh: "r3")),
        ])
        a.keychain.writeFailure = KeychainError.system(errSecInteractionNotAllowed)
        await a.session.restore()
        XCTAssertEqual(a.keychain.values[.refreshToken], "r0")
        a.keychain.writeFailure = nil
        _ = try await a.session.signIn(email: "ana@coco.co", password: "secreta")
        XCTAssertEqual(a.keychain.values[.refreshToken], "r2")
        a.clock.advance(3600)
        _ = try await a.session.validAccessToken()
        XCTAssertEqual(a.transport.received.last.map(body), #"{"refreshToken":"r2"}"#)
        XCTAssertEqual(a.keychain.values[.refreshToken], "r3")
    }
}
