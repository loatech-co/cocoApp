import Foundation
import AppIntents

/// «Registrar gasto»: abre la app en el formulario rápido. Es el que se asigna
/// al botón de acción en iOS 17. No captura nada por sí mismo.
struct RegistrarGastoManualIntent: AppIntent {
    static let title: LocalizedStringResource = "Registrar gasto"
    static let description = IntentDescription("Abre Coco listo para anotar un gasto.")
    static let openAppWhenRun = true

    @Dependency(key: ClavesDeDependencias.navegacion) var navegacion: any Navegacion

    func perform() async throws -> some IntentResult {
        await navegacion.ir(.formularioRapido(conCamara: false))
        return .result()
    }
}
