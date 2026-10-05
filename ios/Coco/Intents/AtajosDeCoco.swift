import Foundation
import AppIntents

/// Los tres intents publicados como App Shortcuts: aparecen en la app Atajos
/// sin configurar nada y el botón de acción de iOS 17 puede lanzarlos.
struct AtajosDeCoco: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RegistrarGastoManualIntent(),
            phrases: [
                "Registrar gasto en \(.applicationName)",
                "Anotar gasto en \(.applicationName)",
            ],
            shortTitle: "Registrar gasto",
            systemImageName: "plus.circle"
        )
        AppShortcut(
            intent: RegistrarGastoDeWalletIntent(),
            phrases: ["Registrar gasto de Wallet en \(.applicationName)"],
            shortTitle: "Gasto de Wallet",
            systemImageName: "creditcard"
        )
        AppShortcut(
            intent: RegistrarGastoDeSMSIntent(),
            phrases: ["Registrar gasto de SMS en \(.applicationName)"],
            shortTitle: "Gasto de SMS",
            systemImageName: "message"
        )
    }
}
