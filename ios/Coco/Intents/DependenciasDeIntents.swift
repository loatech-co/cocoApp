import AppIntents
import Foundation

/// Las claves con que la app registra lo que los intents necesitan. El tipo
/// registrado tiene que ser EXACTAMENTE el existencial que pide `@Dependency`
/// (`any Capturador`, `any Navegacion`); si no coincide, el intent revienta
/// en ejecución con «dependency not found».
enum ClavesDeDependencias {
    static let capturador = "co.loatech.coco.capturador"
    static let navegacion = "co.loatech.coco.navegacion"
}

enum DependenciasDeIntents {
    /// Lo llama M9 al componer la app, antes de que iOS pueda lanzar un intent.
    @MainActor
    static func registrar(capturador: any Capturador, navegacion: any Navegacion) {
        AppDependencyManager.shared.add(key: ClavesDeDependencias.capturador, dependency: capturador)
        AppDependencyManager.shared.add(key: ClavesDeDependencias.navegacion, dependency: navegacion)
    }
}
