import AppIntents
import Foundation

/// Lo lanza la automatización «Transacción» de Atajos tras un pago con Apple
/// Pay. Corre en segundo plano: la captura queda en disco antes de nada y se
/// intenta enviar dentro de 10 s; si no llega, se enviará sola.
struct RegistrarGastoDeWalletIntent: AppIntent {
    static let title: LocalizedStringResource = "Registrar gasto de Wallet"
    static let description = IntentDescription("Registra en Coco un pago hecho con Apple Pay.")
    static let openAppWhenRun = false
    static let budget: Duration = .seconds(10)

    // Siempre String: «Transacción» entrega la moneda formateada y la coerción
    // a número no está garantizada.
    @Parameter(title: "Comercio") var comercio: String?
    @Parameter(title: "Monto") var monto: String?
    @Parameter(title: "Tarjeta") var tarjeta: String?
    @Parameter(title: "Nombre") var nombre: String?

    @Dependency(key: DependencyKeys.capturer) var capturer: any Capturer

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let result = await Self.run(
            merchant: comercio, amount: monto, card: tarjeta, name: nombre, capturer: capturer)
        return .result(dialog: ActionParameters.dialog(result))
    }

    /// Separado de `perform()` para probarlo con un capturer falso.
    static func run(
        merchant: String?, amount: String?, card: String?, name: String?, capturer: any Capturer,
        now: Date = .now
    ) async -> CaptureResult {
        let body = ActionParameters.walletBody(
            merchant: merchant, amount: amount, card: card, name: name, now: now)
        return await capturer.capture(body, source: .wallet, photo: nil, budget: budget)
    }
}
