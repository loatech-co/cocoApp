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
        let js = BootScript.fuente(version: "0.1.0")
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
        XCTAssertTrue(WebBridge.debeEntregar(ultima: nil, ahora: t0, entregasSeguidas: 0))
        XCTAssertFalse(WebBridge.debeEntregar(ultima: t0, ahora: t0.addingTimeInterval(10), entregasSeguidas: 1))
        XCTAssertTrue(WebBridge.debeEntregar(ultima: t0, ahora: t0.addingTimeInterval(31), entregasSeguidas: 1))
        XCTAssertFalse(WebBridge.debeEntregar(ultima: t0, ahora: t0.addingTimeInterval(500), entregasSeguidas: 2))
    }

    func testEventoDeLaWeb() {
        XCTAssertEqual(WebEvent(mensaje: ["tipo": "salir"]), .salir)
        XCTAssertEqual(WebEvent(mensaje: ["tipo": "sesionCerrada"]), .sesionCerrada)
        XCTAssertEqual(WebEvent(mensaje: ["tipo": "sinSesion"]), .sinSesion)
        XCTAssertEqual(WebEvent(mensaje: ["tipo": "abrirCaptura"]), .abrirCaptura)
        XCTAssertNil(WebEvent(mensaje: ["tipo": "borrarTodo"]))
        XCTAssertNil(WebEvent(mensaje: "salir"))
    }

    // MARK: Handler de sesión

    /// Un reloj que avanza 31 s en cada lectura: cada entrega cae fuera de la
    /// ventana de la anterior.
    final class JumpingClock: @unchecked Sendable {
        private var t = Date(timeIntervalSince1970: 1_800_000_000)
        func leer() -> Date {
            t = t.addingTimeInterval(31)
            return t
        }
    }

    @MainActor
    private func puente(sesion: SessionDouble, navegacion: NavigationDouble = NavigationDouble()) -> WebBridge {
        let reloj = JumpingClock()
        return WebBridge(
            sesion: sesion, configuracion: APIConfiguration(base: base), navegacion: navegacion, version: "0.1.0",
            reloj: { reloj.leer() }, abrirExterno: { _ in })
    }

    @MainActor
    func testSinSesionRespondeErrorYNoEntregaNada() async {
        let p = puente(sesion: SessionDouble(estado: .sinSesion, token: nil))
        let (valor, error) = await p.responderPedidoDeSesion(
            esFramePrincipal: true, protocolo: "https", host: "dev-cocoapp.viteri.me", puerto: 0)
        XCTAssertNil(valor)
        XCTAssertEqual(error, "sin-sesion")
    }

    @MainActor
    func testOrigenAjenoRespondeErrorAunqueHayaSesion() async {
        let p = puente(sesion: SessionDouble())
        let (valor, error) = await p.responderPedidoDeSesion(
            esFramePrincipal: false, protocolo: "https", host: "dev-cocoapp.viteri.me", puerto: 0)
        XCTAssertNil(valor)
        XCTAssertEqual(error, "origen-no-permitido")
    }

    @MainActor
    func testConSesionActivaRespondeLasTresClavesYNuncaElRefresh() async throws {
        let p = puente(sesion: SessionDouble())
        let (valor, error) = await p.responderPedidoDeSesion(
            esFramePrincipal: true, protocolo: "https", host: "dev-cocoapp.viteri.me", puerto: 443)
        XCTAssertNil(error)
        let dic = try XCTUnwrap(valor as? [String: Any])
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
        let p = puente(sesion: SessionDouble())
        XCTAssertEqual(p.webView.configuration.applicationNameForUserAgent, "CocoiOS/0.1.0")
        XCTAssertEqual(p.webView.configuration.userContentController.userScripts.first?.isForMainFrameOnly, true)
    }

    @MainActor
    func testLosEventosLleganASesionYNavegacion() async {
        let sesion = SessionDouble()
        let navegacion = NavigationDouble()
        let p = puente(sesion: sesion, navegacion: navegacion)
        await p.recibir(.abrirCaptura)
        XCTAssertEqual(navegacion.destinos, [.formularioRapido(conCamara: false)])
        await p.recibir(.sesionCerrada)
        XCTAssertEqual(sesion.descartes, 1)
        await p.recibir(.salir)
        XCTAssertEqual(sesion.salidas, 1)
    }

    @MainActor
    func testTresPedidosSeguidosDejanLaSesionWebAtascada() async {
        let p = puente(sesion: SessionDouble())
        await p.empujarSesion()
        XCTAssertEqual(p.estadoDeCarga, .cargando)
        await p.empujarSesion()
        await p.empujarSesion()
        XCTAssertEqual(p.estadoDeCarga, .sesionWebAtascada)
    }

    @MainActor
    func testSinConexionLaEntregaQuedaPendiente() async {
        let sesion = SessionDouble(estado: .sinConexion(ultima: SessionDouble.perfil))
        let p = puente(sesion: sesion)
        await p.empujarSesion()
        XCTAssertTrue(p.entregaPendiente)
    }
}
