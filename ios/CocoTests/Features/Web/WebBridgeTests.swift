import WebKit
import XCTest

@testable import Coco

final class WebBridgeTests: XCTestCase {
    private let base = URL(string: "https://dev-cocoapp.viteri.me")!
    private let local = URL(string: "http://localhost:3000")!

    // MARK: Origen permitido

    func testAceptaElOrigenExactoConPuertoImplicito() {
        XCTAssertTrue(
            WebBridge.origenPermitido(
                protocolo: "https", host: "dev-cocoapp.viteri.me", puerto: 0, base: base, esFramePrincipal: true))
        XCTAssertTrue(
            WebBridge.origenPermitido(
                protocolo: "https", host: "dev-cocoapp.viteri.me", puerto: 443, base: base, esFramePrincipal: true))
        XCTAssertTrue(
            WebBridge.origenPermitido(
                protocolo: "http", host: "localhost", puerto: 3000, base: local, esFramePrincipal: true))
        XCTAssertTrue(
            WebBridge.origenPermitido(
                protocolo: "http", host: "localhost", puerto: 0, base: URL(string: "http://localhost:80")!,
                esFramePrincipal: true))
    }

    func testRechazaOtroHostEsquemaPuertoYFramesSecundarios() {
        XCTAssertFalse(
            WebBridge.origenPermitido(
                protocolo: "https", host: "evil.example", puerto: 0, base: base, esFramePrincipal: true))
        XCTAssertFalse(
            WebBridge.origenPermitido(
                protocolo: "http", host: "dev-cocoapp.viteri.me", puerto: 0, base: base, esFramePrincipal: true))
        XCTAssertFalse(
            WebBridge.origenPermitido(
                protocolo: "https", host: "dev-cocoapp.viteri.me", puerto: 8443, base: base, esFramePrincipal: true))
        XCTAssertFalse(
            WebBridge.origenPermitido(
                protocolo: "https", host: "dev-cocoapp.viteri.me", puerto: 0, base: base, esFramePrincipal: false))
        XCTAssertFalse(
            WebBridge.origenPermitido(
                protocolo: "http", host: "localhost", puerto: 3001, base: local, esFramePrincipal: true))
    }

    // MARK: Puros

    func testScriptDeArranqueDefineCocoAppConLaVersion() {
        let js = BootScript.source(version: "0.1.0")
        XCTAssertEqual(js, "window.__COCO_APP__ = Object.freeze({ plataforma: 'ios', version: \"0.1.0\" });")
    }

    func testJavascriptParaIrEscapa() {
        let js = WebBridge.javascriptParaIr("/centros\"de\\costos\nx")
        XCTAssertTrue(js.contains("window.__coco.ir(\"/centros\\\"de\\\\costos\\nx\")"), js)
        XCTAssertFalse(js.contains("\n"))
    }

    func testEsNavegacionPermitida() {
        XCTAssertTrue(
            WebBridge.esNavegacionPermitida(URL(string: "https://dev-cocoapp.viteri.me/mi-cuenta?x=1")!, base: base))
        XCTAssertTrue(WebBridge.esNavegacionPermitida(URL(string: "about:blank")!, base: base))
        XCTAssertFalse(WebBridge.esNavegacionPermitida(URL(string: "https://otro.example/")!, base: base))
        XCTAssertFalse(WebBridge.esNavegacionPermitida(URL(string: "mailto:ana@coco.test")!, base: base))
        XCTAssertFalse(WebBridge.esNavegacionPermitida(URL(string: "http://dev-cocoapp.viteri.me/")!, base: base))
    }

    func testDebeEntregar() {
        let t0 = Date(timeIntervalSince1970: 1_800_000_000)
        XCTAssertTrue(WebBridge.debeEntregar(last: nil, now: t0, entregasSeguidas: 0))
        XCTAssertFalse(WebBridge.debeEntregar(last: t0, now: t0.addingTimeInterval(10), entregasSeguidas: 1))
        XCTAssertTrue(WebBridge.debeEntregar(last: t0, now: t0.addingTimeInterval(31), entregasSeguidas: 1))
        XCTAssertFalse(WebBridge.debeEntregar(last: t0, now: t0.addingTimeInterval(500), entregasSeguidas: 2))
    }

    func testEventoDeLaWeb() {
        XCTAssertEqual(WebEvent(message: ["tipo": "salir"]), .signOut)
        XCTAssertEqual(WebEvent(message: ["tipo": "sesionCerrada"]), .sesionCerrada)
        XCTAssertEqual(WebEvent(message: ["tipo": "sinSesion"]), .signedOut)
        XCTAssertEqual(WebEvent(message: ["tipo": "abrirCaptura"]), .abrirCaptura)
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
    private func puente(session: SessionDouble, navigation: NavigationDouble = NavigationDouble()) -> WebBridge {
        let clock = JumpingClock()
        return WebBridge(
            session: session, configuration: APIConfiguration(base: base), navigation: navigation, version: "0.1.0",
            clock: { clock.read() }, abrirExterno: { _ in })
    }

    @MainActor
    func testSinSesionRespondeErrorYNoEntregaNada() async {
        let p = puente(session: SessionDouble(state: .signedOut, token: nil))
        let (value, error) = await p.responderPedidoDeSesion(
            esFramePrincipal: true, protocolo: "https", host: "dev-cocoapp.viteri.me", puerto: 0)
        XCTAssertNil(value)
        XCTAssertEqual(error, "sin-sesion")
    }

    @MainActor
    func testOrigenAjenoRespondeErrorAunqueHayaSesion() async {
        let p = puente(session: SessionDouble())
        let (value, error) = await p.responderPedidoDeSesion(
            esFramePrincipal: false, protocolo: "https", host: "dev-cocoapp.viteri.me", puerto: 0)
        XCTAssertNil(value)
        XCTAssertEqual(error, "origen-no-permitido")
    }

    @MainActor
    func testConSesionActivaRespondeLasTresClavesYNuncaElRefresh() async throws {
        let p = puente(session: SessionDouble())
        let (value, error) = await p.responderPedidoDeSesion(
            esFramePrincipal: true, protocolo: "https", host: "dev-cocoapp.viteri.me", puerto: 443)
        XCTAssertNil(error)
        let dic = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual(Set(dic.keys), ["access_token", "expires_in", "user"])
        XCTAssertEqual(dic["access_token"] as? String, "token-1")
        XCTAssertEqual(dic["expires_in"] as? Int, 3600)
        let user = try XCTUnwrap(dic["user"] as? [String: Any])
        XCTAssertEqual(user["email"] as? String, "ana@coco.test")
        XCTAssertEqual(user["created_at"] as? String, "2026-01-01T00:00:00Z")
        XCTAssertNil(dic["refresh_token"])
    }

    @MainActor
    func testElWebViewLlevaElUserAgentDeLaApp() {
        let p = puente(session: SessionDouble())
        XCTAssertEqual(p.webView.configuration.applicationNameForUserAgent, "CocoiOS/0.1.0")
        XCTAssertEqual(p.webView.configuration.userContentController.userScripts.first?.isForMainFrameOnly, true)
    }

    @MainActor
    func testLosEventosLleganASesionYNavegacion() async {
        let session = SessionDouble()
        let navigation = NavigationDouble()
        let p = puente(session: session, navigation: navigation)
        await p.recibir(.abrirCaptura)
        XCTAssertEqual(navigation.destinations, [.quickForm(withCamera: false)])
        await p.recibir(.sesionCerrada)
        XCTAssertEqual(session.discards, 1)
        await p.recibir(.signOut)
        XCTAssertEqual(session.signOuts, 1)
    }

    @MainActor
    func testTresPedidosSeguidosDejanLaSesionWebAtascada() async {
        let p = puente(session: SessionDouble())
        await p.empujarSesion()
        XCTAssertEqual(p.estadoDeCarga, .loading)
        await p.empujarSesion()
        await p.empujarSesion()
        XCTAssertEqual(p.estadoDeCarga, .sesionWebAtascada)
    }

    @MainActor
    func testSinConexionLaEntregaQuedaPendiente() async {
        let session = SessionDouble(state: .offline(last: SessionDouble.profile))
        let p = puente(session: session)
        await p.empujarSesion()
        XCTAssertTrue(p.entregaPendiente)
    }
}
