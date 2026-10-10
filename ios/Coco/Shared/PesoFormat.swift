import Foundation

/// Renders a DTO amount («45000», «45000.50») as pesos: «$45.000»,
/// «$45.000,50». By hand and not with `NumberFormatter`, which in es-CO adds a
/// space after the symbol and changes with the iOS version.
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
