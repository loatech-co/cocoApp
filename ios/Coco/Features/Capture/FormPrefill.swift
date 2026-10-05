import Foundation

/// Lo que la persona ya tiene escrito en el formulario, reducido a lo que la
/// interpretación puede tocar. `fecha` en nil significa «no la ha cambiado»:
/// el campo nunca está vacío —arranca en hoy—, pero hoy no es una decisión.
struct FormFields: Equatable, Sendable {
    var amount: String = ""
    var date: String?
    var merchant: String?
    var conceptoId: Int?
}

/// Cómo una `Interpretation` de la API entra en el formulario: rellena lo
/// VACÍO y no pisa nada. La persona pudo escribir el monto mientras la foto
/// se leía, y lo que escribió a mano vale más que lo que leyó una máquina.
enum FormPrefill {
    struct Outcome: Equatable, Sendable {
        var campos: FormFields
        /// El concepto vino de la interpretación: se enseña como «sugerido»
        /// para que se revise antes de confirmar.
        var conceptoSugerido: Bool
        /// Con certeza media la API no se atreve: se abre el buscador con
        /// estos arriba y decide la persona.
        var candidates: [ProposedClassification.Candidate]
    }

    static func aplicar(_ i: Interpretation, to campos: FormFields) -> Outcome {
        var output = campos
        var sugerido = false
        var candidates: [ProposedClassification.Candidate] = []

        if vacio(campos.amount), let amount = i.amount, AmountParser.normalize(amount) != nil {
            // Se enseña como se escribe en Colombia —«45.000»—, que es lo que
            // `AmountParser` vuelve a leer al confirmar.
            output.amount = String(PesoFormat.format(amount).dropFirst())
        }
        if campos.date == nil, let date = i.date, !date.isEmpty {
            output.date = date
        }
        if vacio(campos.merchant), let merchant = i.merchant, !vacio(merchant) {
            output.merchant = merchant
        }
        if campos.conceptoId == nil {
            let c = i.classification
            switch c.confidence {
            case "alta":
                if let id = c.conceptId ?? c.categoryId {
                    output.conceptoId = id
                    sugerido = true
                }
            case "media":
                candidates = c.candidates
            default:
                break
            }
        }
        return Outcome(campos: output, conceptoSugerido: sugerido, candidates: candidates)
    }

    private static func vacio(_ s: String?) -> Bool {
        (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
