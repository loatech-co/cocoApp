import Foundation

/// What the app notifies the web of, by its name in `AppNotices`.
enum WebNotice: String, CaseIterable, Sendable {
    /// A capture from the queue reached the API (2xx): transactions, accounts and
    /// summary changed.
    case captured
    /// The app or the web tab came back to the foreground: a `WKWebView` does not
    /// receive window focus, so the web would not know that time passed.
    case foreground
}

extension WebBridge {
    /// `AppNotices` in `frontend/src/shared/lib/native-contract.ts`. With
    /// `?.` twice: without a session there is no `window.__coco`, and a web older than
    /// these notices does not have the function; in both cases nothing happens.
    nonisolated static func javascript(for notice: WebNotice) -> String {
        "window.__coco?.\(notice.rawValue)?.(); true;"
    }

    /// Returns whether the script ran without an error (an old web also counts
    /// as fine: the notice simply does nothing).
    @discardableResult
    func notify(_ notice: WebNotice) async -> Bool {
        do {
            _ = try await webView.evaluateJavaScript(Self.javascript(for: notice))
            return true
        } catch {
            AppLog.navigation.warning("Aviso a la web sin entregar: \(notice.rawValue, privacy: .public)")
            return false
        }
    }
}
