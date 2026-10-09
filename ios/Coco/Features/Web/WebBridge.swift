import Foundation
import Observation
import UIKit
import WebKit

enum LoadState: Equatable {
    case loading
    case ready
    case failure(URLError.Code)
    /// La web pidió sesión otra vez después de dos entregas seguidas: algo
    /// del lado web no la acepta y sondear no lo arregla.
    case webSessionStuck
}

/// Lo que la web cuenta por `cocoEvents`, sin respuesta. Cada caso se llama
/// como el `type` de `BridgeEvent` en `frontend/src/shared/lib/native-contract.ts`.
enum WebEvent: String, CaseIterable, Equatable {
    case signOut
    case sessionClosed
    case noSession
    case openCapture

    init?(message: Any) {
        guard let dict = message as? [String: Any], let kind = dict["type"] as? String else { return nil }
        self.init(rawValue: kind)
    }
}

/// Lo que la app llama en `window.__coco`, además de los avisos (`WebNotice`).
/// Cada caso se llama como un miembro de `WebBridge` en
/// `frontend/src/shared/lib/bridge.ts`.
enum WebFunction: String, CaseIterable {
    case navigate
    case openSearch
    case receiveSession
    case sessionClosed
}

/// Dueño del ÚNICO `WKWebView` de la app, y los dos extremos del puente con
/// la web. Nunca mete una credencial en la URL ni en una cookie: la sesión
/// viaja por `replyHandler`, dentro del proceso, cuando la web la pide.
@Observable @MainActor
final class WebBridge: NSObject, WKScriptMessageHandlerWithReply, WKScriptMessageHandler, WKNavigationDelegate,
    WKUIDelegate
{
    nonisolated static let sessionHandler = "cocoSession"
    nonisolated static let eventsHandler = "cocoEvents"
    nonisolated static let deliveryWindow: TimeInterval = 30
    nonisolated static let maxConsecutiveDeliveries = 2

    let webView: WKWebView
    private(set) var loadState: LoadState = .loading
    /// Hubo al menos una carga completa: con documento, un fallo de red se
    /// enseña como franja y no como pantalla entera.
    private(set) var hasDocument = false
    /// La web pidió sesión mientras no había red: se entrega al volver.
    private(set) var deliveryPending = false

    private let session: Session
    private let configuration: APIConfiguration
    private let navigation: any Navigation
    private let clock: @Sendable () -> Date
    private let openExternal: (URL) -> Void

    private var lastDelivery: Date?
    private var consecutiveDeliveries = 0

    init(
        session: Session,
        configuration: APIConfiguration,
        navigation: any Navigation,
        version: String = Brand.version,
        clock: @Sendable @escaping () -> Date = Date.init,
        openExternal: @escaping (URL) -> Void = { UIApplication.shared.open($0) }
    ) {
        self.session = session
        self.configuration = configuration
        self.navigation = navigation
        self.clock = clock
        self.openExternal = openExternal

        let config = WKWebViewConfiguration()
        // Mismo prefijo que `USER_AGENT_APP`: la web lo exige junto con el
        // puente para saberse embebida.
        config.applicationNameForUserAgent = Brand.userAgentApp + version
        // Persistente para la caché de los assets con hash; jamás tendrá la
        // cookie de refresh, porque la web embebida nunca pasa por ese camino.
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        let script = WKUserScript(
            source: BootScript.source(version: version), injectionTime: .atDocumentStart, forMainFrameOnly: true,
            in: .page)
        config.userContentController.addUserScript(script)
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()

        // El webView vive lo que la app, así que el ciclo webView → handler →
        // self no se rompe nunca y no hace falta un intermediario débil.
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: Self.sessionHandler)
        config.userContentController.add(self, contentWorld: .page, name: Self.eventsHandler)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
    }

    // MARK: Navegación

    /// `GET <base>/`: URL limpia, la SPA sirve `index.html`.
    func loadHome() {
        loadState = .loading
        webView.load(URLRequest(url: configuration.base.appending(path: "/")))
    }

    /// Sin recargar si la web ya montó `window.__coco`; si no, carga la ruta.
    func go(to path: String) {
        let js = Self.javascriptToGo(path)
        webView.evaluateJavaScript(js) { [weak self] result, _ in
            guard let self else { return }
            if (result as? Bool) != true { self.load(path: path) }
        }
    }

    func openSearch() {
        webView.evaluateJavaScript("window.__coco?.\(WebFunction.openSearch.rawValue)?.(); true;") { _, _ in }
    }

    func reload() {
        consecutiveDeliveries = 0
        loadState = .loading
        if webView.url == nil { loadHome() } else { webView.reload() }
    }

    /// Al volver la red: recarga lo que no cargó y entrega la sesión que quedó
    /// pendiente.
    func connectivityReturned() async {
        if case .failure = loadState { reload() }
        if deliveryPending { await pushSession() }
    }

    private func load(path: String) {
        let trimmed = path.hasPrefix("/") ? String(path.dropFirst()) : path
        webView.load(URLRequest(url: configuration.base.appending(path: trimmed)))
    }

    // MARK: Sesión hacia la web

    /// `window.__coco.receiveSession({...})` como mucho una vez cada 30 s.
    func pushSession() async {
        let now = clock()
        guard Self.shouldDeliver(last: lastDelivery, now: now, consecutiveDeliveries: consecutiveDeliveries) else {
            if consecutiveDeliveries >= Self.maxConsecutiveDeliveries { loadState = .webSessionStuck }
            return
        }
        switch await session.state {
        case .active:
            break
        case .offline:
            deliveryPending = true
            return
        case .signedOut, .loading:
            return
        }
        guard let s = try? await session.webSession(), let json = try? Self.json(from: s) else { return }
        deliveryPending = false
        lastDelivery = now
        consecutiveDeliveries += 1
        _ = try? await webView.evaluateJavaScript(
            "window.__coco?.\(WebFunction.receiveSession.rawValue)?.(\(json)); true;")
    }

    func notifySessionClosed() {
        consecutiveDeliveries = 0
        lastDelivery = nil
        webView.evaluateJavaScript("window.__coco?.\(WebFunction.sessionClosed.rawValue)?.(); true;") { _, _ in }
    }

    // MARK: Handlers

    /// `cocoSession`: responde solo al frame principal del origen de la API.
    func userContentController(
        _ c: WKUserContentController, didReceive m: WKScriptMessage,
        replyHandler: @escaping @MainActor (Any?, String?) -> Void
    ) {
        let isMain = m.frameInfo.isMainFrame
        let source = m.frameInfo.securityOrigin
        Task {
            let (value, error) = await self.answerSessionRequest(
                isMainFrame: isMain, originProtocol: source.protocol, host: source.host, port: source.port)
            replyHandler(value, error)
        }
    }

    /// La parte del handler que se puede probar: `WKScriptMessage` no se deja
    /// construir fuera de WebKit.
    func answerSessionRequest(isMainFrame: Bool, originProtocol: String, host: String, port: Int) async -> (
        Any?, String?
    ) {
        guard
            Self.isOriginAllowed(
                originProtocol: originProtocol, host: host, port: port, base: configuration.base,
                isMainFrame: isMainFrame)
        else {
            return (nil, "origin-not-allowed")
        }
        do {
            let s = try await session.webSession()
            return (try s.asDictionary(), nil)
        } catch SessionError.offline {
            deliveryPending = true
            return (nil, "offline")
        } catch {
            return (nil, "no-session")
        }
    }

    /// `cocoEvents`: lo que la web cuenta sin esperar respuesta.
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        let source = m.frameInfo.securityOrigin
        guard
            Self.isOriginAllowed(
                originProtocol: source.protocol, host: source.host, port: source.port, base: configuration.base,
                isMainFrame: m.frameInfo.isMainFrame),
            let event = WebEvent(message: m.body)
        else { return }
        Task { await self.receive(event) }
    }

    func receive(_ event: WebEvent) async {
        switch event {
        case .signOut:
            // La web limpia su memoria sin llamar a /auth/logout; el logout
            // real, con el refresh, lo hace la app.
            await session.signOut()
        case .sessionClosed:
            // El servidor ya mató la familia (cambio de contraseña, salir de
            // todos los dispositivos): solo queda olvidar lo local.
            await session.discard()
        case .noSession:
            await pushSession()
        case .openCapture:
            navigation.go(.quickForm(withCamera: false))
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
        if Self.isNavigationAllowed(url, base: configuration.base) {
            decisionHandler(.allow)
        } else {
            openExternal(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation?) {
        loadState = .loading
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
        hasDocument = true
        loadState = .ready
        // Documento nuevo: la cuenta de entregas seguidas vuelve a cero.
        consecutiveDeliveries = 0
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation?, withError error: Error) {
        loadFailed((error as? URLError)?.code ?? URLError.Code(rawValue: (error as NSError).code))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation?, withError error: Error) {
        loadFailed((error as? URLError)?.code ?? URLError.Code(rawValue: (error as NSError).code))
    }

    private func loadFailed(_ code: URLError.Code) {
        // Cancelada es lo que WebKit dice cuando se pide otra carga encima:
        // no es un fallo de red.
        guard code != .cancelled else { return }
        loadState = .failure(code)
    }

    /// WebKit mató el proceso de contenido (memoria): la SPA vuelve a arrancar
    /// y pide la sesión al puente, así que recargar es instantáneo.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        reload()
    }

    // MARK: WKUIDelegate

    /// `window.open` y `target="_blank"`: nunca un segundo webview; a Safari.
    func webView(
        _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = action.request.url { openExternal(url) }
        return nil
    }

    // MARK: Puros

    /// En el hilo principal: `WKSecurityOrigin` solo se lee ahí.
    static func isOriginAllowed(_ source: WKSecurityOrigin, base: URL, isMainFrame: Bool) -> Bool {
        isOriginAllowed(
            originProtocol: source.protocol, host: source.host, port: source.port, base: base,
            isMainFrame: isMainFrame)
    }

    /// Protocolo, host y puerto iguales a los de la API, y solo el frame
    /// principal. `puerto` 0 es «el de siempre» del protocolo.
    nonisolated static func isOriginAllowed(
        originProtocol: String, host: String, port: Int, base: URL, isMainFrame: Bool
    ) -> Bool {
        guard isMainFrame else { return false }
        guard let baseScheme = base.scheme?.lowercased(), let baseHost = base.host()?.lowercased() else {
            return false
        }
        guard originProtocol.lowercased() == baseScheme, host.lowercased() == baseHost else { return false }
        return effectivePort(port, scheme: originProtocol) == effectivePort(base.port ?? 0, scheme: baseScheme)
    }

    nonisolated private static func effectivePort(_ port: Int, scheme: String) -> Int {
        if port > 0 { return port }
        return scheme.lowercased() == "https" ? 443 : 80
    }

    /// `window.__coco.navigate(path)` si existe; devuelve `true` si navegó.
    nonisolated static func javascriptToGo(_ path: String) -> String {
        let name = WebFunction.navigate.rawValue
        let call = "window.__coco.\(name)(\(jsonString(path)))"
        return "(typeof window.__coco?.\(name) === 'function') ? (\(call), true) : false;"
    }

    /// Una cadena como literal de JavaScript: por JSON, que ya escapa comillas,
    /// barras y saltos de línea.
    nonisolated static func jsonString(_ text: String) -> String {
        guard
            let data = try? JSONSerialization.data(
                withJSONObject: text, options: [.fragmentsAllowed, .withoutEscapingSlashes]),
            let string = String(data: data, encoding: .utf8)
        else { return "\"\"" }
        return string
    }

    /// Solo el host de la API (y `about:blank`, que WebKit usa por dentro).
    nonisolated static func isNavigationAllowed(_ url: URL, base: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        if scheme == "about" { return true }
        guard scheme == "http" || scheme == "https", let host = url.host() else { return false }
        return isOriginAllowed(
            originProtocol: scheme, host: host, port: url.port ?? 0, base: base, isMainFrame: true)
    }

    /// Una entrega cada 30 s y nunca más de dos seguidas sin que cambie el
    /// documento.
    nonisolated static func shouldDeliver(last: Date?, now: Date, consecutiveDeliveries: Int) -> Bool {
        guard consecutiveDeliveries < maxConsecutiveDeliveries else { return false }
        guard let last else { return true }
        return now.timeIntervalSince(last) >= deliveryWindow
    }

    nonisolated static func json(from session: WebSession) throws -> String {
        let data = try JSONSerialization.data(
            withJSONObject: session.asDictionary(), options: [.withoutEscapingSlashes])
        guard let text = String(data: data, encoding: .utf8) else { throw SessionError.signedOut }
        return text
    }
}
