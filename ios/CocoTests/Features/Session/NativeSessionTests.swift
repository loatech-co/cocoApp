import Security
import XCTest

@testable import Coco

/// The refresh: single-flight, what wipes the Keychain and what does not, the margin.
final class NativeSessionTests: NativeSessionTestCase {
    // MARK: Single-flight and order

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
        // On returning, the keychain already has the new one, and it had it right after
        // the network answered: there is no instant in which an access token is used
        // whose refresh token is not saved.
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

    // MARK: What wipes the keychain and what does not

    func testA401OnRefreshClearsTheKeychainAndSignsOut() async {
        let a = harness(replies: [
            .http(
                401,
                #"{"type":"https://app.coco.invalid/problems/session_expired","title":"La sesión expiró","status":401,"detail":"La sesión expiró.","code":"session_expired"}"#
            )
        ])
        do {
            _ = try await a.session.validAccessToken()
            XCTFail("it had to fail")
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
            XCTFail("it had to fail")
        } catch {
            XCTAssertEqual(error as? SessionError, .offline)
        }
        XCTAssertEqual(paths(a.transport), ["/api/v2/auth/refresh", "/api/v2/auth/refresh"])
        XCTAssertEqual(a.transport.received.map(body), [#"{"refreshToken":"r0"}"#, #"{"refreshToken":"r0"}"#])
        XCTAssertEqual(a.keychain.values[.refreshToken], "r0", "a network failure never clears the Keychain")
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
        a.clock.advance(250)  // 50 s left: it has to refresh
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

    // MARK: Margin

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

    /// The server already rotated the token when the Keychain refuses the write:
    /// the session is live, so it is published, and the token it could not save is
    /// the one the next refresh uses and then saved together with its successor.
    func testAKeychainThatCannotBeWrittenKeepsTheRotatedTokenInMemory() async throws {
        let a = harness(replies: [
            .http(200, Self.sessionJSON(access: "a1", refresh: "r1")),
            .http(200, Self.sessionJSON(access: "a2", refresh: "r2")),
        ])
        a.keychain.writeFailure = KeychainError.system(errSecInteractionNotAllowed)
        await a.session.restore()
        let state = await a.session.state
        XCTAssertEqual(state, .active(Self.profile))
        XCTAssertEqual(a.keychain.values[.refreshToken], "r0")
        a.keychain.writeFailure = nil
        a.clock.advance(3600)
        _ = try await a.session.validAccessToken()
        XCTAssertEqual(a.transport.received.last.map(body), #"{"refreshToken":"r1"}"#)
        XCTAssertEqual(a.keychain.values[.refreshToken], "r2")
    }
}
