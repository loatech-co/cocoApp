import Foundation
import AppIntents

/// Lo lanza la automatización «Mensaje» de Atajos con el SMS del banco. En
/// segundo plano, como el de Wallet. Un texto vacío falla aquí y no se encola.
struct RegistrarGastoDeSMSIntent: AppIntent {
    static let title: LocalizedStringResource = "Registrar gasto de SMS"
    static let description = IntentDescription("Registra en Coco el gasto que anuncia un SMS del banco.")
    static let openAppWhenRun = false
    static let presupuesto: Duration = .seconds(10)

    @Parameter(title: "Texto") var texto: String
    @Parameter(title: "Remitente") var remitente: String?

    @Dependency(key: ClavesDeDependencias.capturador) var capturador: any Capturador

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let resultado = try await Self.ejecutar(texto: texto, remitente: remitente, capturador: capturador)
        return .result(dialog: ParametrosDeAccion.dialogo(resultado))
    }

    static func ejecutar(texto: String, remitente: String?, capturador: any Capturador, ahora: Date = .now) async throws -> ResultadoDeCaptura {
        let cuerpo = try ParametrosDeAccion.cuerpoDeSMS(texto: texto, remitente: remitente, ahora: ahora)
        return await capturador.capturar(cuerpo, origen: .sms, foto: nil, presupuesto: presupuesto)
    }
}
