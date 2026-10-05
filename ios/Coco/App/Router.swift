import Foundation
import Observation

/// Las cuatro pestañas de la barra nativa. Inicio es la web; las otras tres
/// son pantallas nativas.
enum AppTab: Hashable, CaseIterable {
    case inicio
    case register
    case captures
    case mas
}

/// Lo que sube como hoja encima de la pestaña activa.
enum Sheet: Identifiable, Equatable {
    case welcome
    case settings

    var id: String {
        switch self {
        case .welcome: "bienvenida"
        case .settings: "ajustes"
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
        let generacion: Int
        let withCamera: Bool
    }

    var pestana: AppTab = .inicio
    var hoja: Sheet?
    /// Ruta que la pestaña Inicio tiene que abrir en la web en cuanto se vea.
    var rutaWebPendiente: String?
    /// La web tiene que abrir su hoja de búsqueda en cuanto se vea.
    var busquedaPendiente = false
    private(set) var formulario = FormRequest(generacion: 0, withCamera: false)

    func go(_ destination: Destination) {
        AppLog.navigation.info("ir \(String(describing: destination), privacy: .public)")
        switch destination {
        case .quickForm(let withCamera):
            formulario = FormRequest(generacion: formulario.generacion + 1, withCamera: withCamera)
            hoja = nil
            pestana = .register
        case .captures:
            hoja = nil
            pestana = .captures
        case .web(let path):
            hoja = nil
            rutaWebPendiente = path
            pestana = .inicio
        case .search:
            hoja = nil
            busquedaPendiente = true
            pestana = .inicio
        case .welcome:
            hoja = .welcome
        case .settings:
            hoja = .settings
        }
    }

    /// `coco://capturar/manual`, `coco://capturar/foto`, `coco://capturas`.
    /// Devuelve `false` si la URL no es de la app.
    @discardableResult
    func abrir(url: URL) -> Bool {
        guard let destination = Self.destination(de: url) else {
            AppLog.navigation.warning("URL desconocida \(url.absoluteString, privacy: .public)")
            return false
        }
        go(destination)
        return true
    }

    /// Pura: qué destino nombra una URL `coco://`.
    nonisolated static func destination(de url: URL) -> Destination? {
        guard url.scheme?.lowercased() == "coco" else { return nil }
        let host = url.host()?.lowercased() ?? ""
        let camino = url.path().split(separator: "/").map { $0.lowercased() }
        guard camino.count <= 1 else { return nil }
        switch (host, camino.first) {
        case ("capturar", nil), ("capturar", "manual"?):
            return .quickForm(withCamera: false)
        case ("capturar", "foto"?):
            return .quickForm(withCamera: true)
        case ("capturas", nil):
            return .captures
        default:
            return nil
        }
    }
}
