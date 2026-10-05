import AppIntents
import Foundation

/// Las claves con que la app registra lo que los intents necesitan. El tipo
/// registrado tiene que ser EXACTAMENTE el existencial que pide `@Dependency`
/// (`any Capturer`, `any Navigation`); si no coincide, el intent revienta
/// en ejecución con «dependency not found».
enum DependencyKeys {
    static let capturer = "co.loatech.coco.capturer"
    static let navigation = "co.loatech.coco.navigation"
}

enum IntentDependencies {
    /// Lo llama M9 al componer la app, antes de que iOS pueda lanzar un intent.
    @MainActor
    static func register(capturer: any Capturer, navigation: any Navigation) {
        AppDependencyManager.shared.add(key: DependencyKeys.capturer, dependency: capturer)
        AppDependencyManager.shared.add(key: DependencyKeys.navigation, dependency: navigation)
    }
}
