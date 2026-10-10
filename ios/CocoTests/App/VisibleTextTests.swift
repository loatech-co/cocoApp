import XCTest

/// No text the user sees is written loose in the code: it is asked of
/// `L10n` and lives in `Localizable.xcstrings` (CONTRIBUTING.md, «iOS»).
///
/// It reads the source code of the app and of the extension —copied inside the
/// test bundle, because the simulator cannot read the repo—, takes out each
/// string literal and fails if any LOOKS like text —it has an accented letter or an
/// ñ, two words in a row, or it is a word with an initial capital— and it is not
/// among the exceptions. In a place that is seen —`Text(`, `Button(`,
/// `.accessibilityLabel(`, `prompt:`…— it is enough for it to have a letter: there
/// a single lowercase word («sugerido») is text too. Log messages (`.info(`, `.error(`…)
/// do not count: the user does not see them.
///
/// Every exception comes with its reason, and an exception no longer used also
/// fails: the list does not rot.
final class VisibleTextTests: XCTestCase {
    private struct Exception {
        let file: String
        /// `nil`: the whole file.
        let text: String?
        let reason: String
    }

    private static let intentContract =
        "App Intent: título, descripción y parámetros son lo que se ve en Atajos y Siri, escrito en el intent"

    private static let exceptions: [Exception] = [
        // User text from Shortcuts and Siri: it goes literally in the intent (ADR 0021).
        .init(
            file: "Coco/Features/Shortcuts/CocoShortcuts.swift", text: nil,
            reason: "Frases y títulos de los App Shortcuts: lo que se dice a Siri y se ve en Atajos"),
        .init(file: "Coco/Features/Shortcuts/RecordSMSExpenseIntent.swift", text: nil, reason: intentContract),
        .init(file: "Coco/Features/Shortcuts/RecordWalletExpenseIntent.swift", text: nil, reason: intentContract),
        .init(file: "Coco/Features/Shortcuts/RecordManualExpenseIntent.swift", text: nil, reason: intentContract),
        .init(file: "CocoWidgets/OpenCaptureIntent.swift", text: nil, reason: intentContract),
        // The user does not see them.
        .init(
            file: "Coco/App/Dependencies.swift", text: "sin sesión",
            reason: "Nombre del estado de la sesión para el registro"),
        .init(
            file: "Coco/App/Dependencies.swift", text: "sin conexión",
            reason: "Nombre del estado de la sesión para el registro"),
        .init(file: "Coco/Core/Networking/APIRequest.swift", text: "Accept", reason: "Cabecera HTTP"),
        .init(file: "Coco/Core/Networking/APIRequest.swift", text: "Authorization", reason: "Cabecera HTTP"),
        .init(file: "Coco/Core/Storage/DiskQueueStore.swift", text: "Queue", reason: "Carpeta en disco"),
        .init(file: "Coco/Core/Storage/DiskQueueStore.swift", text: "Photos", reason: "Carpeta en disco"),
        .init(file: "Coco/Core/Storage/DiskQueueStore.swift", text: "Quarantine", reason: "Carpeta en disco"),
        .init(
            file: "Coco/Core/Storage/DiskQueueStore.swift", text: "Fecha ilegible: %@",
            reason: "Descripción de un error de decodificación, para depurar"),
        .init(
            file: "Coco/Features/Onboarding/AutomationSteps.swift", text: "shortcuts:// es una URL válida",
            reason: "Mensaje de una precondición"),
        .init(
            file: "Coco/Features/Shortcuts/ActionParameters.swift", text: "Wallet",
            reason: "Texto de la captura que viaja a la API: es un dato, no depende del idioma del teléfono"),
        .init(
            file: "Coco/Features/Web/WebBridge.swift",
            text: "(typeof window.__coco?.%@ === 'function') ? (%@, true) : false;",
            reason: "JavaScript que se evalúa en la web"),
    ]

    // Computed: a `Regex` is not `Sendable` and cannot be a global constant.
    private static var logCall: Regex<(Substring, Substring)> { #/\.(debug|info|notice|warning|error|fault)\($/# }

    /// The places where what is written is seen (or heard) by the user: the
    /// views that receive a title, the accessibility modifiers and the
    /// arguments that are text. `label:` is not there: in SwiftUI it is a closure, and
    /// outside it, it names queues.
    private static var visibleSlot: Regex<Substring> {
        #/(?:^|[^A-Za-z0-9_.])(?:Text|Button|Label|Toggle|TextField|SecureField|LabeledContent|Section|DatePicker|Picker|Link|Menu|ProgressView|ContentUnavailableView)\($|\.(?:navigationTitle|accessibilityLabel|accessibilityHint|accessibilityValue|help|badge|alert|confirmationDialog)\($|(?:^|[^A-Za-z0-9_])(?:prompt|placeholder|title|message):$/#
    }

    static func isVisible(_ literal: SwiftLiterals.Literal) -> Bool {
        guard literal.preceding.firstMatch(of: logCall) == nil else { return false }
        return looksLikeText(literal.value)
            || (literal.value.contains(where: \.isLetter) && literal.preceding.firstMatch(of: visibleSlot) != nil)
    }

    func testNoVisibleTextOutsideTheCatalog() throws {
        // The folders are copied into the test bundle (project.yml).
        let ios = try XCTUnwrap(Bundle(for: Self.self).resourceURL)
        var violations: [String] = []
        var used = Set<Int>()
        var scanned = 0
        for folder in ["Coco", "CocoWidgets"] {
            let root = ios.appending(path: folder)
            let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil))
            for case let url as URL in enumerator where url.pathExtension == "swift" {
                let file = folder + url.path.dropFirst(root.path.count)
                scanned += 1
                for literal in SwiftLiterals.scan(try String(contentsOf: url, encoding: .utf8)) {
                    guard Self.isVisible(literal) else { continue }
                    if let index = Self.exceptions.firstIndex(where: {
                        $0.file == file && ($0.text == nil || $0.text == literal.value)
                    }) {
                        used.insert(index)
                    } else {
                        violations.append("\(file):\(literal.line) «\(literal.value)»")
                    }
                }
            }
        }
        XCTAssertGreaterThan(scanned, 50)
        XCTAssertEqual(violations, [], "Loose texts: move them to L10n and the catalog, or add an exception")
        let unused = Self.exceptions.indices.filter { !used.contains($0) }.map {
            "\(Self.exceptions[$0].file) «\(Self.exceptions[$0].text ?? "*")»"
        }
        XCTAssertEqual(unused, [], "Exceptions that are no longer needed")
    }

    static func looksLikeText(_ value: String) -> Bool {
        value.contains { $0.isLetter && !$0.isASCII }
            || value.firstMatch(of: #/[A-Za-z]{2,} [A-Za-z]{2,}/#) != nil
            || value.wholeMatch(of: #/[A-Z][a-z]+/#) != nil
    }

    func testTheCheckSeesWhatAViewWouldWrite() {
        let source = """
            Text("Guardar")
            Button("Nuevo gasto") {}
            log.info("Arranca contra \\(url)")
            let path = "Photos/\\(id).jpg"
            // Text("comentado")
            Text("sugerido")
            Image(systemName: "trash").accessibilityLabel("borrar")
            List {}.searchable(text: $query, prompt: "buscar")
            Text("$")
            Image("logo")
            let queue = DispatchQueue(label: "co.loatech.coco.network")
            let total = contextText("neto")
            """
        let found = SwiftLiterals.scan(source).filter(Self.isVisible)
        XCTAssertEqual(found.map(\.value), ["Guardar", "Nuevo gasto", "sugerido", "borrar", "buscar"])
        XCTAssertEqual(found.map(\.line), [1, 2, 6, 7, 8])
    }
}

/// A minimal reader of Swift literals: it skips comments, goes into the
/// interpolations (which are read as `%@`) and understands `"""` and escapes.
/// It is enough for these tests; it is not a Swift parser.
enum SwiftLiterals {
    struct Literal: Equatable {
        let line: Int
        let value: String
        /// What is right before, without spaces: to recognize a call.
        let preceding: String
    }

    static func scan(_ source: String) -> [Literal] {
        var reader = Reader(chars: Array(source))
        reader.code(stopAtParen: false)
        return reader.found
    }

    private struct Reader {
        let chars: [Character]
        var index = 0
        var line = 1
        var found: [Literal] = []

        func at(_ text: String) -> Bool {
            let pattern = Array(text)
            guard index + pattern.count <= chars.count else { return false }
            return Array(chars[index..<index + pattern.count]) == pattern
        }

        mutating func advance(_ count: Int = 1) {
            for _ in 0..<count where index < chars.count {
                if chars[index] == "\n" { line += 1 }
                index += 1
            }
        }

        func opener() -> (hashes: Int, quote: String)? {
            var k = index
            while k < chars.count, chars[k] == "#" { k += 1 }
            guard k < chars.count, chars[k] == "\"" else { return nil }
            let triple = k + 2 < chars.count && chars[k + 1] == "\"" && chars[k + 2] == "\""
            return (k - index, triple ? "\"\"\"" : "\"")
        }

        mutating func code(stopAtParen: Bool) {
            var depth = 0
            while index < chars.count {
                if at("//") {
                    while index < chars.count, chars[index] != "\n" { advance() }
                } else if at("/*") {
                    advance(2)
                    while index < chars.count, !at("*/") { advance() }
                    advance(2)
                } else if let (hashes, quote) = opener() {
                    string(hashes: hashes, quote: quote, record: !stopAtParen)
                } else {
                    if stopAtParen {
                        if chars[index] == "(" {
                            depth += 1
                        } else if chars[index] == ")" {
                            if depth == 0 { return }
                            depth -= 1
                        }
                    }
                    advance()
                }
            }
        }

        /// `\` and a line break, inside `"""`, splits the line without adding anything.
        static func unescape(_ escaped: Character) -> String {
            switch escaped {
            case "n": "\n"
            case "t": "\t"
            case "r": "\r"
            case "\n": ""
            default: String(escaped)
            }
        }

        mutating func string(hashes: Int, quote: String, record: Bool) {
            let startLine = line
            let preceding = String(chars[max(0, index - 40)..<index]).trimmingCharacters(in: .whitespacesAndNewlines)
            let pounds = String(repeating: "#", count: hashes)
            let close = quote + pounds
            let escape = "\\" + pounds
            advance(hashes + quote.count)
            var value = ""
            while index < chars.count {
                if at(close) {
                    advance(close.count)
                    break
                }
                if at(escape + "(") {
                    advance(escape.count + 1)
                    code(stopAtParen: true)
                    advance()
                    value += "%@"
                } else if at(escape) {
                    advance(escape.count)
                    value += Self.unescape(chars[index])
                    advance()
                } else {
                    value.append(chars[index])
                    advance()
                }
            }
            if record {
                if quote.count == 3 {
                    value = value.trimmingCharacters(in: .whitespacesAndNewlines)
                }
                found.append(Literal(line: startLine, value: value, preceding: preceding))
            }
        }
    }
}
