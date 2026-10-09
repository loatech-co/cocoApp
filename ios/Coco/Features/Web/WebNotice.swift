import Foundation

/// Lo que la app le avisa a la web, por su nombre en `AppNotices`.
enum WebNotice: String, CaseIterable, Sendable {
    /// Una captura de la cola llegó a la API (2xx): movimientos, cuentas y
    /// resumen cambiaron.
    case captured
    /// La app o la pestaña de la web volvió a primer plano: un `WKWebView` no
    /// recibe el foco de ventana, así que la web no sabría que pasó tiempo.
    case foreground
}

extension WebBridge {
    /// `AppNotices` en `frontend/src/shared/lib/native-contract.ts`. Con
    /// `?.` dos veces: sin sesión no hay `window.__coco`, y una web anterior a
    /// estos avisos no tiene la función; en los dos casos no pasa nada.
    nonisolated static func javascript(for notice: WebNotice) -> String {
        "window.__coco?.\(notice.rawValue)?.(); true;"
    }

    /// Devuelve si el script corrió sin error (una web vieja también cuenta
    /// como bien: el aviso, simplemente, no hace nada).
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
