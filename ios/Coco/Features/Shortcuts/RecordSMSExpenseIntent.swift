import AppIntents
import Foundation

/// Lo lanza la automatización «Mensaje» de Atajos con el SMS del banco. En
/// segundo plano, como el de Wallet. Un texto vacío falla aquí y no se encola.
struct RecordSMSExpenseIntent: AppIntent {
    static let title: LocalizedStringResource = "Registrar gasto de SMS"
    static let description = IntentDescription("Registra en Coco el gasto que anuncia un SMS del banco.")
    static let openAppWhenRun = false
    static let budget: Duration = .seconds(10)

    @Parameter(title: "Texto") var text: String
    @Parameter(title: "Remitente") var sender: String?

    @Dependency(key: DependencyKeys.capturer) var capturer: any Capturer

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let result = try await Self.run(text: text, sender: sender, capturer: capturer)
        return .result(dialog: ActionParameters.dialog(result))
    }

    static func run(text: String, sender: String?, capturer: any Capturer, now: Date = .now) async throws
        -> CaptureResult
    {
        let body = try ActionParameters.smsBody(text: text, sender: sender, now: now)
        return await capturer.capture(body, source: .sms, photo: nil, budget: budget)
    }
}
