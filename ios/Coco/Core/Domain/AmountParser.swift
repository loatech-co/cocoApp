import Foundation

/// Convierte lo que Atajos entrega como texto de moneda («$45.000», «COP
/// 1.200.000», «45,5») al formato del DTO: `^\d+([.,]\d{1,2})?$`, con punto
/// decimal. Lo que no se entiende devuelve nil: mejor una captura sin monto
/// —queda por revisar— que una con el monto equivocado.
enum AmountParser {
    static func normalize(_ text: String?) -> String? {
        guard let text else { return nil }
        // Solo cuentan dígitos y separadores; el símbolo, el código y los
        // espacios son decoración.
        let cleaned = text.filter { $0.isNumber || $0 == "." || $0 == "," }
        guard cleaned.contains(where: \.isNumber) else { return nil }

        let groups = cleaned.split(omittingEmptySubsequences: false) { $0 == "." || $0 == "," }.map(String.init)
        let separators = cleaned.filter { $0 == "." || $0 == "," }
        guard groups.allSatisfy({ !$0.isEmpty }) else { return nil }

        guard let parts = splitParts(groups, separators: separators) else { return nil }
        let (integer, decimal) = parts
        guard integer.allSatisfy(\.isNumber), !integer.isEmpty else { return nil }
        let withoutLeadingZeros = String(integer.drop(while: { $0 == "0" }))
        let base = withoutLeadingZeros.isEmpty ? "0" : withoutLeadingZeros
        if let decimal { return "\(base).\(decimal)" }
        return base
    }

    /// Separa la parte entera de la decimal según cuántos separadores hay y
    /// cuáles. nil si la forma no es la de un monto.
    private static func splitParts(_ groups: [String], separators: String) -> (integer: String, decimal: String?)? {
        var integer = ""
        var decimal: String?

        switch separators.count {
        case 0:
            integer = groups[0]
        case 1:
            let last = groups[1]
            if last.count == 3 {
                // «45.000» y «1,200»: un solo separador con tres cifras detrás
                // es de miles en los dos idiomas.
                integer = groups[0] + last
            } else if (1...2).contains(last.count) {
                integer = groups[0]
                decimal = last
            } else {
                return nil
            }
        default:
            let first = separators.first
            let last = separators.last
            if first == last {
                // «1.200.000»: el mismo separador repetido solo puede ser de miles.
                guard groups.dropFirst().allSatisfy({ $0.count == 3 }) else { return nil }
                integer = groups.joined()
            } else {
                // Dos separadores distintos: el último es el decimal
                // («45.000,50», «1,200.50»).
                guard let tail = groups.last, (1...2).contains(tail.count) else { return nil }
                let thousands = groups.dropLast()
                guard thousands.dropFirst().allSatisfy({ $0.count == 3 }) else { return nil }
                // Un separador de miles no puede aparecer después del decimal.
                guard separators.dropLast().allSatisfy({ $0 == first }) else { return nil }
                integer = thousands.joined()
                decimal = tail
            }
        }

        return (integer, decimal)
    }
}
