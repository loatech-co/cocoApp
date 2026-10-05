import Foundation
import Observation

/// Las cuatro pestañas de la barra nativa. Inicio es la web; las otras tres
/// son pantallas nativas.
enum AppTab: Hashable, CaseIterable {
    case home
    case register
    case captures
    case more
}

/// Lo que sube como hoja encima de la pestaña activa.
enum Sheet: Identifiable, Equatable {
    case welcome
    case settings

    var id: String {
        switch self {
        case .welcome: "welcome"
        case .settings: "settings"
        }
    }
}

/// La ÚNICA fuente de la pestaña y la hoja activas. Lo usan los intents, las
/// notificaciones, las URLs `coco://` y el puente con la web. Si no hay
/// sesión, `RootView` cubre todo con `SignInView` y el destino queda puesto
/// para cuando se entre.
@Observable @MainActor
final class Router: Navigation {
    /// Cada petición de abrir el formulario (deep link, intent, puente) es una
    /// generación nueva: la vista se recrea limpia y con la cámara si se pidió.
    struct FormRequest: Equatable, Sendable {
        let generation: Int
        let withCamera: Bool
    }

    var tab: AppTab = .home
    var sheet: Sheet?
    /// Ruta que la pestaña Inicio tiene que abrir en la web en cuanto se vea.
    var pendingWebPath: String?
    /// La web tiene que abrir su hoja de búsqueda en cuanto se vea.
    var searchPending = false
    private(set) var formRequest = FormRequest(generation: 0, withCamera: false)

    func go(_ destination: Destination) {
        AppLog.navigation.info("ir \(String(describing: destination), privacy: .public)")
        switch destination {
        case .quickForm(let withCamera):
            formRequest = FormRequest(generation: formRequest.generation + 1, withCamera: withCamera)
            sheet = nil
            tab = .register
        case .captures:
            sheet = nil
            tab = .captures
        case .web(let path):
            sheet = nil
            pendingWebPath = path
            tab = .home
        case .search:
            sheet = nil
            searchPending = true
            tab = .home
        case .welcome:
            sheet = .welcome
        case .settings:
            sheet = .settings
        }
    }

    /// `coco://capture/manual`, `coco://capture/photo`, `coco://captures`.
    /// Devuelve `false` si la URL no es de la app.
    @discardableResult
    func open(url: URL) -> Bool {
        guard let destination = Self.destination(from: url) else {
            AppLog.navigation.warning("URL desconocida \(url.absoluteString, privacy: .public)")
            return false
        }
        go(destination)
        return true
    }

    /// Pura: qué destino nombra una URL `coco://`.
    nonisolated static func destination(from url: URL) -> Destination? {
        guard url.scheme?.lowercased() == "coco" else { return nil }
        let host = url.host()?.lowercased() ?? ""
        let segments = url.path().split(separator: "/").map { $0.lowercased() }
        guard segments.count <= 1 else { return nil }
        switch (host, segments.first) {
        case ("capture", nil), ("capture", "manual"?):
            return .quickForm(withCamera: false)
        case ("capture", "photo"?):
            return .quickForm(withCamera: true)
        case ("captures", nil):
            return .captures
        default:
            return nil
        }
    }
}
