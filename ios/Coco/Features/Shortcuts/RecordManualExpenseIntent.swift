import AppIntents
import Foundation

/// «Registrar gasto»: opens the app on the quick form. It is the one assigned
/// to the action button on iOS 17. It does not capture anything by itself.
struct RecordManualExpenseIntent: AppIntent {
    static let title: LocalizedStringResource = "Registrar gasto"
    static let description = IntentDescription("Abre Coco listo para anotar un gasto.")
    static let openAppWhenRun = true

    @Dependency(key: DependencyKeys.navigation) var navigation: any Navigation

    func perform() async throws -> some IntentResult {
        await navigation.go(.quickForm(withCamera: false))
        return .result()
    }
}
