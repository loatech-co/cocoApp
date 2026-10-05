import Foundation

/// Pinta un monto del DTO («45000», «45000.50») como pesos: «$45.000»,
/// «$45.000,50». A mano y no con `NumberFormatter`, que en es-CO mete un
/// espacio tras el símbolo y cambia con la versión de iOS.
enum PesoFormat {
    static func format(_ amount: String) -> String {
        let parts = amount.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
        let integer = parts.first ?? "0"
        var grouped = ""
        for (i, c) in integer.reversed().enumerated() {
            if i > 0, i % 3 == 0 { grouped.append(".") }
            grouped.append(c)
        }
        var output = "$" + String(grouped.reversed())
        if parts.count == 2, let decimals = parts.last, !decimals.isEmpty, decimals.contains(where: { $0 != "0" }) {
            output += "," + decimals
        }
        return output
    }
}
