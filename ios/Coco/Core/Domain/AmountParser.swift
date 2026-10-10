import Foundation

/// Converts what Shortcuts hands over as currency text («$45.000», «COP
/// 1.200.000», «45,5») to the DTO format: `^\d+([.,]\d{1,2})?$`, with a decimal
/// point. What is not understood returns nil: better a capture without an amount
/// —it is left for review— than one with the wrong amount.
enum AmountParser {
    static func normalize(_ text: String?) -> String? {
        guard let text else { return nil }
        // Only digits and separators count; the symbol, the code and the
        // spaces are decoration.
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

    /// Splits the integer part from the decimal one according to how many separators there are and
    /// which ones. nil if the shape is not that of an amount.
    private static func splitParts(_ groups: [String], separators: String) -> (integer: String, decimal: String?)? {
        var integer = ""
        var decimal: String?

        switch separators.count {
        case 0:
            integer = groups[0]
        case 1:
            let last = groups[1]
            if last.count == 3 {
                // «45.000» and «1,200»: a single separator with three digits after it
                // is a thousands separator in both languages.
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
                // «1.200.000»: the same separator repeated can only be thousands.
                guard groups.dropFirst().allSatisfy({ $0.count == 3 }) else { return nil }
                integer = groups.joined()
            } else {
                // Two different separators: the last one is the decimal
                // («45.000,50», «1,200.50»).
                guard let tail = groups.last, (1...2).contains(tail.count) else { return nil }
                let thousands = groups.dropLast()
                guard thousands.dropFirst().allSatisfy({ $0.count == 3 }) else { return nil }
                // A thousands separator cannot appear after the decimal one.
                guard separators.dropLast().allSatisfy({ $0 == first }) else { return nil }
                integer = thousands.joined()
                decimal = tail
            }
        }

        return (integer, decimal)
    }
}
