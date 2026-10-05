import Foundation

/// Lo que la persona ya tiene escrito en el formulario, reducido a lo que la
/// interpretación puede tocar. `fecha` en nil significa «no la ha cambiado»:
/// el campo nunca está vacío —arranca en hoy—, pero hoy no es una decisión.
struct CamposDelFormulario: Equatable, Sendable {
    var monto: String = ""
    var fecha: String? = nil
    var comercio: String? = nil
    var conceptoId: Int? = nil
}

/// Cómo una `Interpretacion` de la API entra en el formulario: rellena lo
/// VACÍO y no pisa nada. La persona pudo escribir el monto mientras la foto
/// se leía, y lo que escribió a mano vale más que lo que leyó una máquina.
enum RellenoDelFormulario {
    struct Resultado: Equatable, Sendable {
        var campos: CamposDelFormulario
        /// El concepto vino de la interpretación: se enseña como «sugerido»
        /// para que se revise antes de confirmar.
        var conceptoSugerido: Bool
        /// Con certeza media la API no se atreve: se abre el buscador con
        /// estos arriba y decide la persona.
        var candidatos: [ClasificacionPropuesta.Candidato]
    }

    static func aplicar(_ i: Interpretacion, a campos: CamposDelFormulario) -> Resultado {
        var salida = campos
        var sugerido = false
        var candidatos: [ClasificacionPropuesta.Candidato] = []

        if vacio(campos.monto), let monto = i.amount, LectorDeMonto.normalizar(monto) != nil {
            // Se enseña como se escribe en Colombia —«45.000»—, que es lo que
            // `LectorDeMonto` vuelve a leer al confirmar.
            salida.monto = String(Pesos.formatear(monto).dropFirst())
        }
        if campos.fecha == nil, let fecha = i.date, !fecha.isEmpty {
            salida.fecha = fecha
        }
        if vacio(campos.comercio), let comercio = i.merchant, !vacio(comercio) {
            salida.comercio = comercio
        }
        if campos.conceptoId == nil {
            let c = i.clasificacion
            switch c.certeza {
            case "alta":
                if let id = c.concepto_id ?? c.categoria_id {
                    salida.conceptoId = id
                    sugerido = true
                }
            case "media":
                candidatos = c.candidatos
            default:
                break
            }
        }
        return Resultado(campos: salida, conceptoSugerido: sugerido, candidatos: candidatos)
    }

    private static func vacio(_ s: String?) -> Bool {
        (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
