import AppIntents
import Foundation

/// Las claves con que la app registra lo que los intents necesitan. El tipo
/// registrado tiene que ser EXACTAMENTE el existencial que pide `@Dependency`
/// (`any Capturer`, `any Navigation`); si no coincide, el intent revienta
/// en ejecución con «dependency not found».
enum DependencyKeys {
    static let capturador = "co.loatech.coco.capturador"
    static let navigation = "co.loatech.coco.navegacion"
}

enum IntentDependencies {
    /// Lo llama M9 al componer la app, antes de que iOS pueda lanzar un intent.
    @MainActor
    static func register(capturador: any Capturer, navigation: any Navigation) {
        AppDependencyManager.shared.add(key: DependencyKeys.capturador, dependency: capturador)
        AppDependencyManager.shared.add(key: DependencyKeys.navigation, dependency: navigation)
    }
}
