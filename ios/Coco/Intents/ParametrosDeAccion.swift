import AppIntents
import Foundation

enum ErrorDeParametros: Error, Equatable {
    case textoVacio
}

/// Lo que Atajos entrega, convertido a un `CuerpoDeCaptura`. Puro: ni red ni
/// cola, para probarlo con fechas y textos fijos.
enum ParametrosDeAccion {
    static let textoDeEnCola = "Guardado en el teléfono; se enviará cuando haya red."

    /// Wallet: el comercio manda; si falta, el «nombre» de la transacción. El
    /// texto nunca queda vacío —«Wallet · <tarjeta> · <nombre>»— porque la
    /// API devuelve 422 ante una captura sin texto ni comercio.
    static func cuerpoDeWallet(comercio: String?, monto: String?, tarjeta: String?, nombre: String?, ahora: Date)
        -> CuerpoDeCaptura
    {
        let comercioLimpio = limpiar(comercio)
        let nombreLimpio = limpiar(nombre)
        let partes = ["Wallet", limpiar(tarjeta), nombreLimpio].compactMap { $0 }
        return CuerpoDeCaptura(
            texto: partes.joined(separator: " · "),
            comercio: comercioLimpio ?? nombreLimpio,
            monto: LectorDeMonto.normalizar(monto),
            fecha: FechaDeBogota.dia(ahora)
        )
    }

    /// SMS: el texto va íntegro —es lo que la API sabe leer— y el remitente en
    /// la nota, para no contaminar la interpretación. Vacío no se encola.
    static func cuerpoDeSMS(texto: String, remitente: String?, ahora: Date) throws -> CuerpoDeCaptura {
        let limpio = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !limpio.isEmpty else { throw ErrorDeParametros.textoVacio }
        return CuerpoDeCaptura(
            texto: limpio,
            fecha: FechaDeBogota.dia(ahora),
            nota: limpiar(remitente).map { "De: \($0)" }
        )
    }

    /// Lo que dice el diálogo del atajo: el resumen de la API tal cual, o que
    /// quedó guardado.
    static func textoDeDialogo(_ r: ResultadoDeCaptura) -> String {
        switch r {
        case .enviada(let g):
            return g.porRevisar ? "\(g.resumen) · por revisar" : g.resumen
        case .enCola(let pendientes):
            return pendientes > 1 ? "\(textoDeEnCola) \(pendientes) pendientes." : textoDeEnCola
        case .fallida(let motivo):
            return "No se pudo registrar: \(motivo)"
        }
    }

    static func dialogo(_ r: ResultadoDeCaptura) -> IntentDialog {
        IntentDialog(stringLiteral: textoDeDialogo(r))
    }

    private static func limpiar(_ texto: String?) -> String? {
        guard let t = texto?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
        return t
    }
}
