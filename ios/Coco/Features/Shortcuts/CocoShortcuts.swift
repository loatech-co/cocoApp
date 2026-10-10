import AppIntents
import Foundation

/// The three intents published as App Shortcuts: they show up in the Shortcuts app
/// without configuring anything and the iOS 17 action button can launch them.
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
