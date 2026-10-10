import AppIntents
import Foundation

/// The keys with which the app registers what the intents need. The registered
/// type has to be EXACTLY the existential that `@Dependency` asks for
/// (`any Capturer`, `any Navigation`); if it does not match, the intent blows up
/// at run time with «dependency not found».
enum DependencyKeys {
    static let capturer = "co.loatech.coco.capturer"
    static let navigation = "co.loatech.coco.navigation"
}

enum IntentDependencies {
    /// M9 calls it when composing the app, before iOS can launch an intent.
    @MainActor
    static func register(capturer: any Capturer, navigation: any Navigation) {
        AppDependencyManager.shared.add(key: DependencyKeys.capturer, dependency: capturer)
        AppDependencyManager.shared.add(key: DependencyKeys.navigation, dependency: navigation)
    }
}
