import AppIntents
import Foundation

/// «Registrar gasto»: abre la app en el formulario rápido. Es el que se asigna
/// al botón de acción en iOS 17. No captura nada por sí mismo.
struct RegistrarGastoManualIntent: AppIntent {
    static let title: LocalizedStringResource = "Registrar gasto"
    static let description = IntentDescription("Abre Coco listo para anotar un gasto.")
    static let openAppWhenRun = true

    @Dependency(key: DependencyKeys.navigation) var navigation: any Navigation

    func perform() async throws -> some IntentResult {
        await navigation.go(.quickForm(withCamera: false))
        return .result()
    }
}
