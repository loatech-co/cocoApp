import Foundation
import WebKit

// MARK: Pure rules

extension WebBridge {
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

// MARK: Where a URL may go

extension WebBridge {
    /// Only the API's host (and `about:blank`, which WebKit uses internally).
    nonisolated static func isNavigationAllowed(_ url: URL, base: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        if scheme == "about" { return true }
        guard scheme == "http" || scheme == "https", let host = url.host() else { return false }
        return isOriginAllowed(
            originProtocol: scheme, host: host, port: url.port ?? 0, base: base, isMainFrame: true)
    }

    /// A link out of the API's host opens in the browser or in Mail. Any other
    /// scheme (`tel:`, `sms:`, `shortcuts://`, the app's own `coco://`) is dropped:
    /// the web does not get to decide which app opens next.
    nonisolated static func isExternalOpenAllowed(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        return scheme == "http" || scheme == "https" || scheme == "mailto"
    }
}
