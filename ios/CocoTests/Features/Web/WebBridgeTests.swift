import WebKit
import XCTest

@testable import Coco

final class WebBridgeTests: XCTestCase {
    private let base = URL(string: "https://dev-cocoapp.viteri.me")!
    private let local = URL(string: "http://localhost:3000")!

    // MARK: Origen permitido

    func testAcceptsTheExactOriginWithImplicitPort() {
        XCTAssertTrue(
            WebBridge.isOriginAllowed(
                originProtocol: "https", host: "dev-cocoapp.viteri.me", port: 0, base: base, isMainFrame: true))
        XCTAssertTrue(
            WebBridge.isOriginAllowed(
                originProtocol: "https", host: "dev-cocoapp.viteri.me", port: 443, base: base, isMainFrame: true))
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
                originProtocol: "http", host: "dev-cocoapp.viteri.me", port: 0, base: base, isMainFrame: true))
        XCTAssertFalse(
            WebBridge.isOriginAllowed(
                originProtocol: "https", host: "dev-cocoapp.viteri.me", port: 8443, base: base, isMainFrame: true))
        XCTAssertFalse(
            WebBridge.isOriginAllowed(
                originProtocol: "https", host: "dev-cocoapp.viteri.me", port: 0, base: base, isMainFrame: false))
        XCTAssertFalse(
            WebBridge.isOriginAllowed(
                originProtocol: "http", host: "localhost", port: 3001, base: local, isMainFrame: true))
    }

    // MARK: Puros

    func testBootScriptDefinesCocoAppWithTheVersion() {
        let js = BootScript.source(version: "0.1.0")
        XCTAssertEqual(js, "window.__COCO_APP__ = Object.freeze({ plataforma: 'ios', version: \"0.1.0\" });")
    }

    func testJavascriptToGoEscapes() {
        let js = WebBridge.javascriptToGo("/centros\"de\\costos\nx")
        XCTAssertTrue(js.contains("window.__coco.ir(\"/centros\\\"de\\\\costos\\nx\")"), js)
        XCTAssertFalse(js.contains("\n"))
    }

    func testIsNavigationAllowed() {
        XCTAssertTrue(
            WebBridge.isNavigationAllowed(URL(string: "https://dev-cocoapp.viteri.me/mi-cuenta?x=1")!, base: base))
        XCTAssertTrue(WebBridge.isNavigationAllowed(URL(string: "about:blank")!, base: base))
        XCTAssertFalse(WebBridge.isNavigationAllowed(URL(string: "https://otro.example/")!, base: base))
        XCTAssertFalse(WebBridge.isNavigationAllowed(URL(string: "mailto:ana@coco.test")!, base: base))
        XCTAssertFalse(WebBridge.isNavigationAllowed(URL(string: "http://dev-cocoapp.viteri.me/")!, base: base))
    }

    func testShouldDeliver() {
        let t0 = Date(timeIntervalSince1970: 1_800_000_000)
        XCTAssertTrue(WebBridge.shouldDeliver(last: nil, now: t0, consecutiveDeliveries: 0))
        XCTAssertFalse(WebBridge.shouldDeliver(last: t0, now: t0.addingTimeInterval(10), consecutiveDeliveries: 1))
        XCTAssertTrue(WebBridge.shouldDeliver(last: t0, now: t0.addingTimeInterval(31), consecutiveDeliveries: 1))
        XCTAssertFalse(WebBridge.shouldDeliver(last: t0, now: t0.addingTimeInterval(500), consecutiveDeliveries: 2))
    }

    func testWebEvent() {
        XCTAssertEqual(WebEvent(message: ["tipo": "salir"]), .signOut)
        XCTAssertEqual(WebEvent(message: ["tipo": "sesionCerrada"]), .sessionClosed)
        XCTAssertEqual(WebEvent(message: ["tipo": "sinSesion"]), .signedOut)
        XCTAssertEqual(WebEvent(message: ["tipo": "abrirCaptura"]), .openCapture)
        XCTAssertNil(WebEvent(message: ["tipo": "borrarTodo"]))
        XCTAssertNil(WebEvent(message: "salir"))
    }

    // MARK: Handler de sesión

    /// Un reloj que avanza 31 s en cada lectura: cada entrega cae fuera de la
    /// ventana de la anterior.
    final class JumpingClock: @unchecked Sendable {
        private var t = Date(timeIntervalSince1970: 1_800_000_000)
        func read() -> Date {
            t = t.addingTimeInterval(31)
            return t
        }
    }

    @MainActor
    private func bridge(session: SessionDouble, navigation: NavigationDouble = NavigationDouble()) -> WebBridge {
        let clock = JumpingClock()
        return WebBridge(
            session: session, configuration: APIConfiguration(base: base), navigation: navigation, version: "0.1.0",
            clock: { clock.read() }, openExternal: { _ in })
    }

    @MainActor
    func testSignedOutAnswersErrorAndDeliversNothing() async {
        let p = bridge(session: SessionDouble(state: .signedOut, token: nil))
        let (value, error) = await p.answerSessionRequest(
            isMainFrame: true, originProtocol: "https", host: "dev-cocoapp.viteri.me", port: 0)
        XCTAssertNil(value)
        XCTAssertEqual(error, "sin-sesion")
    }

    @MainActor
    func testForeignOriginAnswersErrorEvenWithASession() async {
        let p = bridge(session: SessionDouble())
        let (value, error) = await p.answerSessionRequest(
            isMainFrame: false, originProtocol: "https", host: "dev-cocoapp.viteri.me", port: 0)
        XCTAssertNil(value)
        XCTAssertEqual(error, "origen-no-permitido")
    }

    @MainActor
    func testActiveSessionAnswersTheThreeKeysAndNeverTheRefresh() async throws {
        let p = bridge(session: SessionDouble())
        let (value, error) = await p.answerSessionRequest(
            isMainFrame: true, originProtocol: "https", host: "dev-cocoapp.viteri.me", port: 443)
        XCTAssertNil(error)
        let dict = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual(Set(dict.keys), ["access_token", "expires_in", "user"])
        XCTAssertEqual(dict["access_token"] as? String, "token-1")
        XCTAssertEqual(dict["expires_in"] as? Int, 3600)
        let user = try XCTUnwrap(dict["user"] as? [String: Any])
        XCTAssertEqual(user["email"] as? String, "ana@coco.test")
        XCTAssertEqual(user["created_at"] as? String, "2026-01-01T00:00:00Z")
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
