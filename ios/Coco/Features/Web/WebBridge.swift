import Foundation
import Observation
import UIKit
import WebKit

enum LoadState: Equatable {
    case loading
    case ready
    case failure(URLError.Code)
    /// The web asked for a session again after two deliveries in a row: something
    /// on the web side does not accept it and polling does not fix it.
    case webSessionStuck
}

/// What the web reports through `cocoEvents`, with no reply. Each case is named
/// like the `type` of `BridgeEvent` in `frontend/src/shared/lib/native-contract.ts`.
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

/// What the app calls in `window.__coco`, besides the notices (`WebNotice`).
/// Each case is named like a member of `WebBridge` in
/// `frontend/src/shared/lib/bridge.ts`.
enum WebFunction: String, CaseIterable {
    case navigate
    case openSearch
    case receiveSession
    case sessionClosed
}

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
        if let url = action.request.url { openExternal(url) }
        return nil
    }

    // MARK: Pure

    /// On the main thread: `WKSecurityOrigin` is only read there.
    static func isOriginAllowed(_ source: WKSecurityOrigin, base: URL, isMainFrame: Bool) -> Bool {
        isOriginAllowed(
            originProtocol: source.protocol, host: source.host, port: source.port, base: base,
            isMainFrame: isMainFrame)
    }

    /// Protocol, host and port equal to the API's, and only the main
    /// frame. `port` 0 is the protocol's «usual one».
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

    /// `window.__coco.navigate(path)` if it exists; returns `true` if it navigated.
    nonisolated static func javascriptToGo(_ path: String) -> String {
        let name = WebFunction.navigate.rawValue
        let call = "window.__coco.\(name)(\(jsonString(path)))"
        return "(typeof window.__coco?.\(name) === 'function') ? (\(call), true) : false;"
    }

    /// A string as a JavaScript literal: through JSON, which already escapes quotes,
    /// backslashes and line breaks.
    nonisolated static func jsonString(_ text: String) -> String {
        guard
            let data = try? JSONSerialization.data(
                withJSONObject: text, options: [.fragmentsAllowed, .withoutEscapingSlashes]),
            let string = String(data: data, encoding: .utf8)
        else { return "\"\"" }
        return string
    }

    /// Only the API's host (and `about:blank`, which WebKit uses internally).
    nonisolated static func isNavigationAllowed(_ url: URL, base: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        if scheme == "about" { return true }
        guard scheme == "http" || scheme == "https", let host = url.host() else { return false }
        return isOriginAllowed(
            originProtocol: scheme, host: host, port: url.port ?? 0, base: base, isMainFrame: true)
    }

    /// One delivery every 30 s and never more than two in a row without the
    /// document changing.
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
