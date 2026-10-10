import WebKit
import XCTest
import os

@testable import Coco

final class WebBridgeTests: XCTestCase {
    private let base = URL(string: "https://app.coco.invalid")!
    private let local = URL(string: "http://localhost:3000")!

    // MARK: Allowed origin

    func testAcceptsTheExactOriginWithImplicitPort() {
        XCTAssertTrue(
            WebBridge.isOriginAllowed(
                originProtocol: "https", host: "app.coco.invalid", port: 0, base: base, isMainFrame: true))
        XCTAssertTrue(
            WebBridge.isOriginAllowed(
                originProtocol: "https", host: "app.coco.invalid", port: 443, base: base, isMainFrame: true))
        XCTAssertTrue(
            WebBridge.isOriginAllowed(
                originProtocol: "http", host: "localhost", port: 3000, base: local, isMainFrame: true))
        XCTAssertTrue(
            WebBridge.isOriginAllowed(
                originProtocol: "http", host: "localhost", port: 0, base: URL(string: "http://localhost:80")!,
                isMainFrame: true))
    }

    func testRejectsOtherHostSchemePortAndSubframes() {
        XCTAssertFalse(
            WebBridge.isOriginAllowed(
                originProtocol: "https", host: "evil.example", port: 0, base: base, isMainFrame: true))
        XCTAssertFalse(
            WebBridge.isOriginAllowed(
                originProtocol: "http", host: "app.coco.invalid", port: 0, base: base, isMainFrame: true))
        XCTAssertFalse(
            WebBridge.isOriginAllowed(
                originProtocol: "https", host: "app.coco.invalid", port: 8443, base: base, isMainFrame: true))
        XCTAssertFalse(
            WebBridge.isOriginAllowed(
                originProtocol: "https", host: "app.coco.invalid", port: 0, base: base, isMainFrame: false))
        XCTAssertFalse(
            WebBridge.isOriginAllowed(
                originProtocol: "http", host: "localhost", port: 3001, base: local, isMainFrame: true))
    }

    // MARK: Pure

    func testBootScriptDefinesCocoAppWithTheVersion() {
        let js = BootScript.source(version: "0.1.0")
        XCTAssertEqual(js, "window.__COCO_APP__ = Object.freeze({ plataforma: 'ios', version: \"0.1.0\" });")
    }

    func testJavascriptToGoEscapes() {
        let js = WebBridge.javascriptToGo("/centros\"de\\costos\nx")
        XCTAssertTrue(js.contains("window.__coco.navigate(\"/centros\\\"de\\\\costos\\nx\")"), js)
        XCTAssertFalse(js.contains("\n"))
    }

    func testIsNavigationAllowed() {
        XCTAssertTrue(
            WebBridge.isNavigationAllowed(URL(string: "https://app.coco.invalid/account?x=1")!, base: base))
        XCTAssertTrue(WebBridge.isNavigationAllowed(URL(string: "about:blank")!, base: base))
        XCTAssertFalse(WebBridge.isNavigationAllowed(URL(string: "https://otro.example/")!, base: base))
        XCTAssertFalse(WebBridge.isNavigationAllowed(URL(string: "mailto:ana@coco.test")!, base: base))
        XCTAssertFalse(WebBridge.isNavigationAllowed(URL(string: "http://app.coco.invalid/")!, base: base))
    }

    func testShouldDeliver() {
        let t0 = Date(timeIntervalSince1970: 1_800_000_000)
        XCTAssertTrue(WebBridge.shouldDeliver(last: nil, now: t0, consecutiveDeliveries: 0))
        XCTAssertFalse(WebBridge.shouldDeliver(last: t0, now: t0.addingTimeInterval(10), consecutiveDeliveries: 1))
        XCTAssertTrue(WebBridge.shouldDeliver(last: t0, now: t0.addingTimeInterval(31), consecutiveDeliveries: 1))
        XCTAssertFalse(WebBridge.shouldDeliver(last: t0, now: t0.addingTimeInterval(500), consecutiveDeliveries: 2))
    }

    func testWebEvent() {
        XCTAssertEqual(WebEvent(message: ["type": "signOut"]), .signOut)
        XCTAssertEqual(WebEvent(message: ["type": "sessionClosed"]), .sessionClosed)
        XCTAssertEqual(WebEvent(message: ["type": "noSession"]), .noSession)
        XCTAssertEqual(WebEvent(message: ["type": "openCapture"]), .openCapture)
        XCTAssertNil(WebEvent(message: ["type": "wipeEverything"]))
        XCTAssertNil(WebEvent(message: ["tipo": "signOut"]))
        XCTAssertNil(WebEvent(message: "signOut"))
    }

    // MARK: Session handler

    /// A clock that advances 31 s on each read: each delivery falls outside the
    /// window of the previous one.
    final class JumpingClock: Sendable {
        private let t = OSAllocatedUnfairLock(initialState: Date(timeIntervalSince1970: 1_800_000_000))
        func read() -> Date {
            t.withLock {
                $0 = $0.addingTimeInterval(31)
                return $0
            }
        }
    }

    @MainActor
    private func bridge(session: SessionDouble, navigation: NavigationDouble = NavigationDouble()) -> WebBridge {
        let clock = JumpingClock()
        return WebBridge(
            session: session, configuration: APIConfiguration(base: base), navigation: navigation, version: "0.1.0",
            clock: { clock.read() }, openExternal: { _ in })
    }

    // MARK: Notices towards the web

    func testNoticesUseTheContractNamesAndNeverFailOnAnOldWeb() {
        XCTAssertEqual(WebNotice.captured.rawValue, "captured")
        XCTAssertEqual(WebNotice.foreground.rawValue, "foreground")
        for notice in WebNotice.allCases {
            XCTAssertEqual(WebBridge.javascript(for: notice), "window.__coco?.\(notice.rawValue)?.(); true;")
        }
    }

    /// In a real WKWebView: without `__coco` (without a session), with an old `__coco`
    /// that does not know the notices, and with one that does.
    @MainActor
    func testNoticesReachTheWebAndAreHarmlessWithoutIt() async throws {
        let p = bridge(session: SessionDouble())
        p.webView.loadHTMLString("<html><body></body></html>", baseURL: nil)
        for _ in 0..<100 where p.webView.isLoading { try await Task.sleep(for: .milliseconds(20)) }

        let withoutCoco = await p.notify(.captured)
        XCTAssertTrue(withoutCoco)
        _ = try await p.webView.evaluateJavaScript("window.__coco = { navigate() {} }; true;")
        let oldWeb = await p.notify(.foreground)
        XCTAssertTrue(oldWeb)

        _ = try await p.webView.evaluateJavaScript(
            "window.avisos = []; window.__coco = { captured() { avisos.push('c') }, foreground() { avisos.push('p') } }; true;"
        )
        await p.notify(.captured)
        await p.notify(.foreground)
        let received = try await p.webView.evaluateJavaScript("avisos.join(',')") as? String
        XCTAssertEqual(received, "c,p")
    }

    @MainActor
    func testSignedOutAnswersErrorAndDeliversNothing() async {
        let p = bridge(session: SessionDouble(state: .signedOut, token: nil))
        let (value, error) = await p.answerSessionRequest(
            isMainFrame: true, originProtocol: "https", host: "app.coco.invalid", port: 0)
        XCTAssertNil(value)
        XCTAssertEqual(error, "no-session")
    }

    @MainActor
    func testForeignOriginAnswersErrorEvenWithASession() async {
        let p = bridge(session: SessionDouble())
        let (value, error) = await p.answerSessionRequest(
            isMainFrame: false, originProtocol: "https", host: "app.coco.invalid", port: 0)
        XCTAssertNil(value)
        XCTAssertEqual(error, "origin-not-allowed")
    }

    @MainActor
    func testActiveSessionAnswersTheThreeKeysAndNeverTheRefresh() async throws {
        let p = bridge(session: SessionDouble())
        let (value, error) = await p.answerSessionRequest(
            isMainFrame: true, originProtocol: "https", host: "app.coco.invalid", port: 443)
        XCTAssertNil(error)
        let dict = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual(Set(dict.keys), ["accessToken", "expiresIn", "user"])
        XCTAssertEqual(dict["accessToken"] as? String, "token-1")
        XCTAssertEqual(dict["expiresIn"] as? Int, 3600)
        let user = try XCTUnwrap(dict["user"] as? [String: Any])
        XCTAssertEqual(user["email"] as? String, "ana@coco.test")
        XCTAssertEqual(user["createdAt"] as? String, "2026-01-01T00:00:00Z")
        XCTAssertNil(dict["refresh_token"])
    }

    @MainActor
    func testTheWebViewCarriesTheAppUserAgent() {
        let p = bridge(session: SessionDouble())
        XCTAssertEqual(p.webView.configuration.applicationNameForUserAgent, "CocoiOS/0.1.0")
        XCTAssertEqual(p.webView.configuration.userContentController.userScripts.first?.isForMainFrameOnly, true)
    }

    @MainActor
    func testEventsReachSessionAndNavigation() async {
        let session = SessionDouble()
        let navigation = NavigationDouble()
        let p = bridge(session: session, navigation: navigation)
        await p.receive(.openCapture)
        XCTAssertEqual(navigation.destinations, [.quickForm(withCamera: false)])
        await p.receive(.sessionClosed)
        XCTAssertEqual(session.discards, 1)
        await p.receive(.signOut)
        XCTAssertEqual(session.signOuts, 1)
    }

    @MainActor
    func testThreeRequestsInARowLeaveTheWebSessionStuck() async {
        let p = bridge(session: SessionDouble())
        await p.pushSession()
        XCTAssertEqual(p.loadState, .loading)
        await p.pushSession()
        await p.pushSession()
        XCTAssertEqual(p.loadState, .webSessionStuck)
    }

    @MainActor
    func testOfflineLeavesTheDeliveryPending() async {
        let session = SessionDouble(state: .offline(last: SessionDouble.profile))
        let p = bridge(session: session)
        await p.pushSession()
        XCTAssertTrue(p.deliveryPending)
    }
}
