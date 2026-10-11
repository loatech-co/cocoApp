import Security
import XCTest

@testable import Coco

/// Signing out, discarding and a Keychain that cannot be read.
final class NativeSessionSignOutTests: NativeSessionTestCase {
    // MARK: Signing out

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

    /// `discard` while a refresh is still waiting for the network: the cancelled
    /// refresh must not publish `offline` on top of the `signedOut` (the sign-in
    /// cover would close and the web would show up with no session).
    func testDiscardWhileARefreshIsInFlightLeavesTheSessionSignedOut() async throws {
        let a = try blockedHarness()
        let refreshing = Task { try await a.session.validAccessToken() }
        var arrivals = a.transport.arrivals.makeAsyncIterator()
        let request = await arrivals.next()
        XCTAssertEqual(request?.url?.path(), "/api/v2/auth/refresh")
        await a.session.discard()
        let result = await refreshing.result
        XCTAssertThrowsError(try result.get()) { XCTAssertEqual($0 as? APIError, .cancelled) }
        let state = await a.session.state
        XCTAssertEqual(state, .signedOut)
        XCTAssertNil(a.keychain.values[.refreshToken])
    }

    /// `signOut` awaits `/auth/logout` and the actor is reentrant across that await:
    /// a `validAccessToken()` from the queue or the bridge meanwhile must not open a
    /// refresh that lands after `closeLocally()` and revives the family.
    func testARefreshAskedWhileSigningOutDoesNotReviveTheSession() async throws {
        let a = try blockedHarness()
        let collected = Task { () -> [SessionState] in
            var seen: [SessionState] = []
            for await e in a.session.changes {
                seen.append(e)
                if e == .signedOut { break }
            }
            return seen
        }
        let signingOut = Task { await a.session.signOut() }
        var arrivals = a.transport.arrivals.makeAsyncIterator()
        let logout = await arrivals.next()
        XCTAssertEqual(logout?.url?.path(), "/api/v2/auth/logout")
        let asked = await Task { try await a.session.validAccessToken() }.result
        XCTAssertThrowsError(try asked.get()) { XCTAssertEqual($0 as? SessionError, .signedOut) }
        // The logout never answers: whoever tapped «salir» leaves anyway.
        signingOut.cancel()
        await signingOut.value
        let seen = await collected.value
        XCTAssertEqual(seen, [.signedOut])
        XCTAssertEqual(a.transport.received.compactMap { $0.url?.path() }, ["/api/v2/auth/logout"])
        XCTAssertNil(a.keychain.values[.refreshToken])
    }

    // MARK: A Keychain that cannot be read

    /// Before the first unlock after a reboot the Keychain refuses to answer. That
    /// is not «no token»: the session goes offline and the token stays.
    func testAKeychainThatCannotBeReadGoesOfflineInsteadOfSigningOut() async {
        let a = harness(replies: [.http(200, Self.sessionJSON(access: "a1", refresh: "r1"))])
        a.keychain.failure = KeychainError.system(errSecInteractionNotAllowed)
        await a.session.restore()
        let state = await a.session.state
        XCTAssertEqual(state, .offline(last: nil))
        XCTAssertTrue(a.transport.received.isEmpty)
        a.keychain.failure = nil
        XCTAssertEqual(a.keychain.values[.refreshToken], "r0")
        // Once it answers again, the same token restores the session.
        await a.session.restore()
        let restored = await a.session.state
        XCTAssertEqual(restored, .active(Self.profile))
    }

}
