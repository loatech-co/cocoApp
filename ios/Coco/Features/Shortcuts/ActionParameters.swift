import AppIntents
import Foundation

enum ParameterError: Error, Equatable {
    case textoVacio
}

/// Lo que Atajos entrega, convertido a un `CaptureBody`. Puro: ni red ni
/// cola, para probarlo con fechas y textos fijos.
enum ActionParameters {
    static let textoDeEnCola = "Guardado en el teléfono; se enviará cuando haya red."

    /// Wallet: el comercio manda; si falta, el «nombre» de la transacción. El
    /// texto nunca queda vacío —«Wallet · <tarjeta> · <nombre>»— porque la
    /// API devuelve 422 ante una captura sin texto ni comercio.
    static func cuerpoDeWallet(merchant: String?, amount: String?, tarjeta: String?, name: String?, now: Date)
        -> CaptureBody
    {
        let comercioLimpio = limpiar(merchant)
        let nombreLimpio = limpiar(name)
        let parts = ["Wallet", limpiar(tarjeta), nombreLimpio].compactMap { $0 }
        return CaptureBody(
            text: parts.joined(separator: " · "),
            merchant: comercioLimpio ?? nombreLimpio,
            amount: AmountParser.normalize(amount),
            date: BogotaDate.day(now)
        )
    }

    /// SMS: el texto va íntegro —es lo que la API sabe leer— y el remitente en
    /// la nota, para no contaminar la interpretación. Vacío no se encola.
    static func cuerpoDeSMS(text: String, remitente: String?, now: Date) throws -> CaptureBody {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { throw ParameterError.textoVacio }
        return CaptureBody(
            text: cleaned,
            date: BogotaDate.day(now),
            note: limpiar(remitente).map { "De: \($0)" }
        )
    }

    /// Lo que dice el diálogo del atajo: el resumen de la API tal cual, o que
    /// quedó guardado.
    static func textoDeDialogo(_ r: CaptureResult) -> String {
        switch r {
        case .sent(let g):
            return g.needsReview ? "\(g.summary) · por revisar" : g.summary
        case .queued(let pending):
            return pending > 1 ? "\(textoDeEnCola) \(pending) pendientes." : textoDeEnCola
        case .failed(let reason):
            return "No se pudo registrar: \(reason)"
        }
    }

    static func dialogo(_ r: CaptureResult) -> IntentDialog {
        IntentDialog(stringLiteral: textoDeDialogo(r))
    }

    private static func limpiar(_ text: String?) -> String? {
        guard let t = text?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
        return t
    }
}
