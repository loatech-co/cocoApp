import Foundation

/// Pinta un monto del DTO («45000», «45000.50») como pesos: «$45.000»,
/// «$45.000,50». A mano y no con `NumberFormatter`, que en es-CO mete un
/// espacio tras el símbolo y cambia con la versión de iOS.
enum PesoFormat {
    static func formatear(_ monto: String) -> String {
        let partes = monto.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
        let entero = partes.first ?? "0"
        var agrupado = ""
        for (i, c) in entero.reversed().enumerated() {
            if i > 0, i % 3 == 0 { agrupado.append(".") }
            agrupado.append(c)
        }
        var salida = "$" + String(agrupado.reversed())
        if partes.count == 2, let dec = partes.last, !dec.isEmpty, dec.contains(where: { $0 != "0" }) {
            salida += "," + dec
        }
        return salida
    }
}
