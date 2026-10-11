import Foundation
import Observation
import UIKit
import WebKit

/// Owner of the app's ONLY `WKWebView`, and both ends of the bridge with
/// the web. It never puts a credential in the URL or in a cookie: the session
/// travels through `replyHandler`, inside the process, when the web asks for it.
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
    /// There was at least one complete load: with a document, a network failure is
    /// shown as a strip and not as a whole screen.
    private(set) var hasDocument = false
    /// The web asked for a session while there was no network: it is delivered when it comes back.
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
        // Same prefix as `USER_AGENT_APP`: the web demands it, together with the
        // bridge, to know it is embedded.
        config.applicationNameForUserAgent = Brand.userAgentApp + version
        // Persistent for the cache of the hashed assets; it will never have the
        // refresh cookie, because the embedded web never goes down that path.
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        let script = WKUserScript(
            source: BootScript.source(version: version), injectionTime: .atDocumentStart, forMainFrameOnly: true,
            in: .page)
        config.userContentController.addUserScript(script)
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()

        // The webView lives as long as the app, so the webView → handler →
        // self cycle never breaks and a weak intermediary is not needed.
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: Self.sessionHandler)
        config.userContentController.add(self, contentWorld: .page, name: Self.eventsHandler)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
    }

    // MARK: Navigation

    /// `GET <base>/`: clean URL, the SPA serves `index.html`.
    func loadHome() {
        loadState = .loading
        webView.load(URLRequest(url: configuration.base.appending(path: "/")))
    }

    /// Without reloading if the web already mounted `window.__coco`; if not, it loads the route.
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

    /// When the network comes back: reloads what did not load and delivers the session that was left
    /// pending.
    func connectivityReturned() async {
        if case .failure = loadState { reload() }
        if deliveryPending { await pushSession() }
    }

    private func load(path: String) {
        let trimmed = path.hasPrefix("/") ? String(path.dropFirst()) : path
        webView.load(URLRequest(url: configuration.base.appending(path: trimmed)))
    }

    // MARK: Session towards the web

    /// `window.__coco.receiveSession({...})` at most once every 30 s.
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

    /// `cocoSession`: answers only the main frame of the API's origin.
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

    /// The part of the handler that can be tested: `WKScriptMessage` cannot be
    /// built outside WebKit.
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

    /// `cocoEvents`: what the web reports without waiting for a reply.
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
            // The web clears its memory without calling /auth/logout; the real
            // logout, with the refresh token, is done by the app.
            await session.signOut()
        case .sessionClosed:
            // The server already killed the family (password change, signing out of
            // all devices): all that is left is to forget what is local.
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
            openOutside(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation?) {
        loadState = .loading
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
        hasDocument = true
        loadState = .ready
        // New document: the count of deliveries in a row goes back to zero.
        consecutiveDeliveries = 0
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation?, withError error: Error) {
        loadFailed((error as? URLError)?.code ?? URLError.Code(rawValue: (error as NSError).code))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation?, withError error: Error) {
        loadFailed((error as? URLError)?.code ?? URLError.Code(rawValue: (error as NSError).code))
    }

    private func loadFailed(_ code: URLError.Code) {
        // Cancelled is what WebKit says when another load is requested on top:
        // it is not a network failure.
        guard code != .cancelled else { return }
        loadState = .failure(code)
    }

    /// WebKit killed the content process (memory): the SPA starts again
    /// and asks the bridge for the session, so reloading is instant.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        reload()
    }

    // MARK: WKUIDelegate

    /// `window.open` and `target="_blank"`: never a second webview; to Safari.
    func webView(
        _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = action.request.url { openOutside(url) }
        return nil
    }

    /// What leaves the app goes to the browser or to Mail, and nothing else.
    private func openOutside(_ url: URL) {
        guard Self.isExternalOpenAllowed(url) else { return }
        openExternal(url)
    }
}
