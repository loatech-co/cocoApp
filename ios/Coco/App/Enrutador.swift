import Foundation
import Observation

/// Las cuatro pestañas de la barra nativa. Inicio es la web; las otras tres
/// son pantallas nativas.
enum Pestana: Hashable, CaseIterable {
    case inicio
    case registrar
    case capturas
    case mas
}

/// Lo que sube como hoja encima de la pestaña activa.
enum Hoja: Identifiable, Equatable {
    case bienvenida
    case ajustes

    var id: String {
        switch self {
        case .bienvenida: "bienvenida"
        case .ajustes: "ajustes"
        }
    }
}

/// La ÚNICA fuente de la pestaña y la hoja activas. Lo usan los intents, las
/// notificaciones, las URLs `coco://` y el puente con la web. Si no hay
/// sesión, `RaizView` cubre todo con `EntrarView` y el destino queda puesto
/// para cuando se entre.
@Observable @MainActor
final class Enrutador: Navegacion {
    /// Cada petición de abrir el formulario (deep link, intent, puente) es una
    /// generación nueva: la vista se recrea limpia y con la cámara si se pidió.
    struct PeticionDeFormulario: Equatable, Sendable {
        let generacion: Int
        let conCamara: Bool
    }

    var pestana: Pestana = .inicio
    var hoja: Hoja?
    /// Ruta que la pestaña Inicio tiene que abrir en la web en cuanto se vea.
    var rutaWebPendiente: String?
    /// La web tiene que abrir su hoja de búsqueda en cuanto se vea.
    var busquedaPendiente = false
    private(set) var formulario = PeticionDeFormulario(generacion: 0, conCamara: false)

    func ir(_ destino: Destino) {
        Bitacora.navegacion.info("ir \(String(describing: destino), privacy: .public)")
        switch destino {
        case .formularioRapido(let conCamara):
            formulario = PeticionDeFormulario(generacion: formulario.generacion + 1, conCamara: conCamara)
            hoja = nil
            pestana = .registrar
        case .capturas:
            hoja = nil
            pestana = .capturas
        case .web(let ruta):
            hoja = nil
            rutaWebPendiente = ruta
            pestana = .inicio
        case .buscar:
            hoja = nil
            busquedaPendiente = true
            pestana = .inicio
        case .bienvenida:
            hoja = .bienvenida
        case .ajustes:
            hoja = .ajustes
        }
    }

    /// `coco://capturar/manual`, `coco://capturar/foto`, `coco://capturas`.
    /// Devuelve `false` si la URL no es de la app.
    @discardableResult
    func abrir(url: URL) -> Bool {
        guard let destino = Self.destino(de: url) else {
            Bitacora.navegacion.warning("URL desconocida \(url.absoluteString, privacy: .public)")
            return false
        }
        ir(destino)
        return true
    }

    /// Pura: qué destino nombra una URL `coco://`.
    nonisolated static func destino(de url: URL) -> Destino? {
        guard url.scheme?.lowercased() == "coco" else { return nil }
        let host = url.host()?.lowercased() ?? ""
        let camino = url.path().split(separator: "/").map { $0.lowercased() }
        guard camino.count <= 1 else { return nil }
        switch (host, camino.first) {
        case ("capturar", nil), ("capturar", "manual"?):
            return .formularioRapido(conCamara: false)
        case ("capturar", "foto"?):
            return .formularioRapido(conCamara: true)
        case ("capturas", nil):
            return .capturas
        default:
            return nil
        }
    }
}
