import Foundation
import Observation
import UIKit
import WebKit

enum LoadState: Equatable {
    case cargando
    case lista
    case fallo(URLError.Code)
    /// La web pidió sesión otra vez después de dos entregas seguidas: algo
    /// del lado web no la acepta y sondear no lo arregla.
    case sesionWebAtascada
}

/// Lo que la web cuenta por `cocoEventos`, sin respuesta.
enum WebEvent: Equatable {
    case salir
    case sesionCerrada
    case sinSesion
    case abrirCaptura

    init?(mensaje: Any) {
        guard let dic = mensaje as? [String: Any], let tipo = dic["tipo"] as? String else { return nil }
        switch tipo {
        case "salir": self = .salir
        case "sesionCerrada": self = .sesionCerrada
        case "sinSesion": self = .sinSesion
        case "abrirCaptura": self = .abrirCaptura
        default: return nil
        }
    }
}

/// Dueño del ÚNICO `WKWebView` de la app, y los dos extremos del puente con
/// la web. Nunca mete una credencial en la URL ni en una cookie: la sesión
/// viaja por `replyHandler`, dentro del proceso, cuando la web la pide.
@Observable @MainActor
final class WebBridge: NSObject, WKScriptMessageHandlerWithReply, WKScriptMessageHandler, WKNavigationDelegate,
    WKUIDelegate
{
    static let handlerDeSesion = "cocoSesion"
    static let handlerDeEventos = "cocoEventos"
    static let ventanaDeEntrega: TimeInterval = 30
    static let entregasMaximasSeguidas = 2

    let webView: WKWebView
    private(set) var estadoDeCarga: LoadState = .cargando
    /// Hubo al menos una carga completa: con documento, un fallo de red se
    /// enseña como franja y no como pantalla entera.
    private(set) var hayDocumento = false
    /// La web pidió sesión mientras no había red: se entrega al volver.
    private(set) var entregaPendiente = false

    private let sesion: Session
    private let configuracion: APIConfiguration
    private let navegacion: any Navigation
    private let reloj: @Sendable () -> Date
    private let abrirExterno: (URL) -> Void

    private var ultimaEntrega: Date?
    private var entregasSeguidas = 0

    init(
        sesion: Session,
        configuracion: APIConfiguration,
        navegacion: any Navigation,
        version: String = Brand.version,
        reloj: @Sendable @escaping () -> Date = Date.init,
        abrirExterno: @escaping (URL) -> Void = { UIApplication.shared.open($0) }
    ) {
        self.sesion = sesion
        self.configuracion = configuracion
        self.navegacion = navegacion
        self.reloj = reloj
        self.abrirExterno = abrirExterno

        let conf = WKWebViewConfiguration()
        // Mismo prefijo que `USER_AGENT_APP`: la web lo exige junto con el
        // puente para saberse embebida.
        conf.applicationNameForUserAgent = Brand.userAgentApp + version
        // Persistente para la caché de los assets con hash; jamás tendrá la
        // cookie de refresh, porque la web embebida nunca pasa por ese camino.
        conf.websiteDataStore = .default()
        conf.allowsInlineMediaPlayback = true
        let script = WKUserScript(
            source: BootScript.fuente(version: version), injectionTime: .atDocumentStart, forMainFrameOnly: true,
            in: .page)
        conf.userContentController.addUserScript(script)
        webView = WKWebView(frame: .zero, configuration: conf)
        super.init()

        // El webView vive lo que la app, así que el ciclo webView → handler →
        // self no se rompe nunca y no hace falta un intermediario débil.
        conf.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: Self.handlerDeSesion)
        conf.userContentController.add(self, contentWorld: .page, name: Self.handlerDeEventos)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
    }

    // MARK: Navegación

    /// `GET <base>/`: URL limpia, la SPA sirve `index.html`.
    func cargarInicio() {
        estadoDeCarga = .cargando
        webView.load(URLRequest(url: configuracion.base.appending(path: "/")))
    }

    /// Sin recargar si la web ya montó `window.__coco`; si no, carga la ruta.
    func ir(a ruta: String) {
        let js = Self.javascriptParaIr(ruta)
        webView.evaluateJavaScript(js) { [weak self] resultado, _ in
            guard let self else { return }
            if (resultado as? Bool) != true { self.cargar(ruta: ruta) }
        }
    }

    func abrirBusqueda() {
        webView.evaluateJavaScript("window.__coco?.abrirBusqueda?.(); true;") { _, _ in }
    }

    func recargar() {
        entregasSeguidas = 0
        estadoDeCarga = .cargando
        if webView.url == nil { cargarInicio() } else { webView.reload() }
    }

    /// Al volver la red: recarga lo que no cargó y entrega la sesión que quedó
    /// pendiente.
    func conectividadVolvio() async {
        if case .fallo = estadoDeCarga { recargar() }
        if entregaPendiente { await empujarSesion() }
    }

    private func cargar(ruta: String) {
        let limpia = ruta.hasPrefix("/") ? String(ruta.dropFirst()) : ruta
        webView.load(URLRequest(url: configuracion.base.appending(path: limpia)))
    }

    // MARK: Sesión hacia la web

    /// `window.__coco.recibirSesion({...})` como mucho una vez cada 30 s.
    func empujarSesion() async {
        let ahora = reloj()
        guard Self.debeEntregar(ultima: ultimaEntrega, ahora: ahora, entregasSeguidas: entregasSeguidas) else {
            if entregasSeguidas >= Self.entregasMaximasSeguidas { estadoDeCarga = .sesionWebAtascada }
            return
        }
        switch await sesion.estado {
        case .activa:
            break
        case .sinConexion:
            entregaPendiente = true
            return
        case .sinSesion, .cargando:
            return
        }
        guard let s = try? await sesion.sesionParaLaWeb(), let json = try? Self.json(de: s) else { return }
        entregaPendiente = false
        ultimaEntrega = ahora
        entregasSeguidas += 1
        webView.evaluateJavaScript("window.__coco?.recibirSesion?.(\(json)); true;") { _, _ in }
    }

    func avisarSesionCerrada() {
        entregasSeguidas = 0
        ultimaEntrega = nil
        webView.evaluateJavaScript("window.__coco?.sesionCerrada?.(); true;") { _, _ in }
    }

    // MARK: Handlers

    /// `cocoSesion`: responde solo al frame principal del origen de la API.
    func userContentController(
        _ c: WKUserContentController, didReceive m: WKScriptMessage,
        replyHandler: @escaping @MainActor (Any?, String?) -> Void
    ) {
        let esPrincipal = m.frameInfo.isMainFrame
        let origen = m.frameInfo.securityOrigin
        Task {
            let (valor, error) = await self.responderPedidoDeSesion(
                esFramePrincipal: esPrincipal, protocolo: origen.protocol, host: origen.host, puerto: origen.port)
            replyHandler(valor, error)
        }
    }

    /// La parte del handler que se puede probar: `WKScriptMessage` no se deja
    /// construir fuera de WebKit.
    func responderPedidoDeSesion(esFramePrincipal: Bool, protocolo: String, host: String, puerto: Int) async -> (
        Any?, String?
    ) {
        guard
            Self.origenPermitido(
                protocolo: protocolo, host: host, puerto: puerto, base: configuracion.base,
                esFramePrincipal: esFramePrincipal)
        else {
            return (nil, "origen-no-permitido")
        }
        do {
            let s = try await sesion.sesionParaLaWeb()
            return (try s.comoDiccionario(), nil)
        } catch SessionError.sinConexion {
            entregaPendiente = true
            return (nil, "sin-conexion")
        } catch {
            return (nil, "sin-sesion")
        }
    }

    /// `cocoEventos`: lo que la web cuenta sin esperar respuesta.
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        let origen = m.frameInfo.securityOrigin
        guard
            Self.origenPermitido(
                protocolo: origen.protocol, host: origen.host, puerto: origen.port, base: configuracion.base,
                esFramePrincipal: m.frameInfo.isMainFrame),
            let evento = WebEvent(mensaje: m.body)
        else { return }
        Task { await self.recibir(evento) }
    }

    func recibir(_ evento: WebEvent) async {
        switch evento {
        case .salir:
            // La web limpia su memoria sin llamar a /auth/logout; el logout
            // real, con el refresh, lo hace la app.
            await sesion.salir()
        case .sesionCerrada:
            // El servidor ya mató la familia (cambio de contraseña, salir de
            // todos los dispositivos): solo queda olvidar lo local.
            await sesion.descartar()
        case .sinSesion:
            await empujarSesion()
        case .abrirCaptura:
            navegacion.ir(.formularioRapido(conCamara: false))
        }
    }

    // MARK: WKNavigationDelegate

    func webView(
        _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = action.request.url else {
            decisionHandler(.cancel)
            return
        }
        if Self.esNavegacionPermitida(url, base: configuracion.base) {
            decisionHandler(.allow)
        } else {
            abrirExterno(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        estadoDeCarga = .cargando
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hayDocumento = true
        estadoDeCarga = .lista
        // Documento nuevo: la cuenta de entregas seguidas vuelve a cero.
        entregasSeguidas = 0
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fallo((error as? URLError)?.code ?? URLError.Code(rawValue: (error as NSError).code))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fallo((error as? URLError)?.code ?? URLError.Code(rawValue: (error as NSError).code))
    }

    private func fallo(_ codigo: URLError.Code) {
        // Cancelada es lo que WebKit dice cuando se pide otra carga encima:
        // no es un fallo de red.
        guard codigo != .cancelled else { return }
        estadoDeCarga = .fallo(codigo)
    }

    /// WebKit mató el proceso de contenido (memoria): la SPA vuelve a arrancar
    /// y pide la sesión al puente, así que recargar es instantáneo.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        recargar()
    }

    // MARK: WKUIDelegate

    /// `window.open` y `target="_blank"`: nunca un segundo webview; a Safari.
    func webView(
        _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = action.request.url { abrirExterno(url) }
        return nil
    }

    // MARK: Puros

    nonisolated static func origenPermitido(_ origen: WKSecurityOrigin, base: URL, esFramePrincipal: Bool) -> Bool {
        origenPermitido(
            protocolo: origen.protocol, host: origen.host, puerto: origen.port, base: base,
            esFramePrincipal: esFramePrincipal)
    }

    /// Protocolo, host y puerto iguales a los de la API, y solo el frame
    /// principal. `puerto` 0 es «el de siempre» del protocolo.
    nonisolated static func origenPermitido(
        protocolo: String, host: String, puerto: Int, base: URL, esFramePrincipal: Bool
    ) -> Bool {
        guard esFramePrincipal else { return false }
        guard let esquemaBase = base.scheme?.lowercased(), let hostBase = base.host()?.lowercased() else {
            return false
        }
        guard protocolo.lowercased() == esquemaBase, host.lowercased() == hostBase else { return false }
        return puertoEfectivo(puerto, esquema: protocolo) == puertoEfectivo(base.port ?? 0, esquema: esquemaBase)
    }

    nonisolated private static func puertoEfectivo(_ puerto: Int, esquema: String) -> Int {
        if puerto > 0 { return puerto }
        return esquema.lowercased() == "https" ? 443 : 80
    }

    /// `window.__coco.ir(ruta)` si existe; devuelve `true` si navegó.
    nonisolated static func javascriptParaIr(_ ruta: String) -> String {
        "(typeof window.__coco?.ir === 'function') ? (window.__coco.ir(\(cadenaJSON(ruta))), true) : false;"
    }

    /// Una cadena como literal de JavaScript: por JSON, que ya escapa comillas,
    /// barras y saltos de línea.
    nonisolated static func cadenaJSON(_ texto: String) -> String {
        guard
            let datos = try? JSONSerialization.data(
                withJSONObject: texto, options: [.fragmentsAllowed, .withoutEscapingSlashes]),
            let cadena = String(data: datos, encoding: .utf8)
        else { return "\"\"" }
        return cadena
    }

    /// Solo el host de la API (y `about:blank`, que WebKit usa por dentro).
    nonisolated static func esNavegacionPermitida(_ url: URL, base: URL) -> Bool {
        guard let esquema = url.scheme?.lowercased() else { return false }
        if esquema == "about" { return true }
        guard esquema == "http" || esquema == "https", let host = url.host() else { return false }
        return origenPermitido(
            protocolo: esquema, host: host, puerto: url.port ?? 0, base: base, esFramePrincipal: true)
    }

    /// Una entrega cada 30 s y nunca más de dos seguidas sin que cambie el
    /// documento.
    nonisolated static func debeEntregar(ultima: Date?, ahora: Date, entregasSeguidas: Int) -> Bool {
        guard entregasSeguidas < entregasMaximasSeguidas else { return false }
        guard let ultima else { return true }
        return ahora.timeIntervalSince(ultima) >= ventanaDeEntrega
    }

    nonisolated static func json(de sesion: WebSession) throws -> String {
        let datos = try JSONSerialization.data(
            withJSONObject: sesion.comoDiccionario(), options: [.withoutEscapingSlashes])
        guard let texto = String(data: datos, encoding: .utf8) else { throw SessionError.sinSesion }
        return texto
    }
}
