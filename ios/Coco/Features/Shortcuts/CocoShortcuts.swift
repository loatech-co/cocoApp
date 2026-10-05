import AppIntents
import Foundation

/// Los tres intents publicados como App Shortcuts: aparecen en la app Atajos
/// sin configurar nada y el botón de acción de iOS 17 puede lanzarlos.
struct CocoShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RecordManualExpenseIntent(),
            phrases: [
                "Registrar gasto en \(.applicationName)",
                "Anotar gasto en \(.applicationName)",
            ],
            shortTitle: "Registrar gasto",
            systemImageName: "plus.circle"
        )
        AppShortcut(
            intent: RecordWalletExpenseIntent(),
            phrases: ["Registrar gasto de Wallet en \(.applicationName)"],
            shortTitle: "Gasto de Wallet",
            systemImageName: "creditcard"
        )
        AppShortcut(
            intent: RecordSMSExpenseIntent(),
            phrases: ["Registrar gasto de SMS en \(.applicationName)"],
            shortTitle: "Gasto de SMS",
            systemImageName: "message"
        )
    }
}
