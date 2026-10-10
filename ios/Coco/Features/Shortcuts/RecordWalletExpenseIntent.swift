import AppIntents
import Foundation

/// Launched by the Shortcuts «Transacción» automation after an Apple
/// Pay payment. It runs in the background: the capture is on disk before anything else and it
/// tries to send within 10 s; if it does not arrive, it will be sent by itself.
struct RecordWalletExpenseIntent: AppIntent {
    static let title: LocalizedStringResource = "Registrar gasto de Wallet"
    static let description = IntentDescription("Registra en Coco un pago hecho con Apple Pay.")
    static let openAppWhenRun = false
    static let budget: Duration = .seconds(10)

    // Always String: «Transacción» hands over the formatted currency and the coercion
    // to a number is not guaranteed.
    @Parameter(title: "Comercio") var merchant: String?
    @Parameter(title: "Monto") var amount: String?
    @Parameter(title: "Tarjeta") var card: String?
    @Parameter(title: "Nombre") var name: String?

    @Dependency(key: DependencyKeys.capturer) var capturer: any Capturer

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let result = await Self.run(
            merchant: merchant, amount: amount, card: card, name: name, capturer: capturer)
        return .result(dialog: ActionParameters.dialog(result))
    }

    /// Separate from `perform()` to test it with a fake capturer.
    static func run(
        merchant: String?, amount: String?, card: String?, name: String?, capturer: any Capturer,
        now: Date = .now
    ) async -> CaptureResult {
        let body = ActionParameters.walletBody(
            merchant: merchant, amount: amount, card: card, name: name, now: now)
        return await capturer.capture(body, source: .wallet, photo: nil, budget: budget)
    }
}
