import Foundation

/// Cuts out, byte by byte, the object value of a key inside another object
/// of a JSON. It interprets nothing: it only counts braces and respects strings.
enum JSONSlicer {
    // A byte scanner: one case per structural character and a state that
    // crosses them all. Splitting it into functions forces passing that state from hand
    // to hand and reads worse than the whole loop.
    // swiftlint:disable:next cyclomatic_complexity function_body_length
    static func object(key: String, inside parent: String, at data: Data) -> Data? {
        let bytes = [UInt8](data)
        var i = 0
        var depth = 0
        var currentKey: [UInt8] = []
        var awaitingValue = false
        var insideParent = false
        var parentDepth = 0
        let target = Array(key.utf8)
        let parentName = Array(parent.utf8)

        while i < bytes.count {
            let b = bytes[i]
            switch b {
            case UInt8(ascii: "\""):
                guard let end = endOfString(bytes, from: i) else { return nil }
                let content = Array(bytes[(i + 1)..<end])
                // A string followed by ':' is a key; if not, it is a value.
                var j = end + 1
                while j < bytes.count, isBlankByte(bytes[j]) { j += 1 }
                if j < bytes.count, bytes[j] == UInt8(ascii: ":") {
                    currentKey = content
                    awaitingValue = true
                    i = j + 1
                    continue
                }
                awaitingValue = false
                i = end + 1
            case UInt8(ascii: "{"):
                if awaitingValue {
                    if depth == 1, currentKey == parentName {
                        insideParent = true
                        parentDepth = 2
                    } else if insideParent, depth == parentDepth, currentKey == target {
                        guard let close = endOfObject(bytes, from: i) else { return nil }
                        return Data(bytes[i...close])
                    }
                }
                awaitingValue = false
                depth += 1
                i += 1
            case UInt8(ascii: "}"):
                depth -= 1
                if insideParent, depth < parentDepth { insideParent = false }
                i += 1
            case UInt8(ascii: "["):
                awaitingValue = false
                depth += 1
                i += 1
            case UInt8(ascii: "]"):
                depth -= 1
                i += 1
            default:
                if !isBlankByte(b) { awaitingValue = false }
                i += 1
            }
        }
        return nil
    }

    private static func isBlankByte(_ b: UInt8) -> Bool {
        b == 0x20 || b == 0x0A || b == 0x0D || b == 0x09
    }

    /// Index of the quote that closes the string opened at `from`.
    private static func endOfString(_ bytes: [UInt8], from: Int) -> Int? {
        var i = from + 1
        while i < bytes.count {
            if bytes[i] == UInt8(ascii: "\\") {
                i += 2
                continue
            }
            if bytes[i] == UInt8(ascii: "\"") { return i }
            i += 1
        }
        return nil
    }

    /// Index of the brace that closes the object opened at `from`.
    private static func endOfObject(_ bytes: [UInt8], from: Int) -> Int? {
        var i = from
        var level = 0
        while i < bytes.count {
            switch bytes[i] {
            case UInt8(ascii: "\""):
                guard let end = endOfString(bytes, from: i) else { return nil }
                i = end
            case UInt8(ascii: "{"), UInt8(ascii: "["):
                level += 1
            case UInt8(ascii: "}"), UInt8(ascii: "]"):
                level -= 1
                if level == 0 { return i }
            default:
                break
            }
            i += 1
        }
        return nil
    }
}
