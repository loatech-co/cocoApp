import XCTest

/// Ningún texto que vea el usuario se escribe suelto en el código: se pide a
/// `L10n` y vive en `Localizable.xcstrings` (CONTRIBUTING.md, «iOS»).
///
/// Lee el código fuente de la app y de la extensión —copiado dentro del
/// paquete de pruebas, porque el simulador no puede leer el repo—, saca cada
/// literal de cadena y falla si alguno PARECE texto —lleva una letra con tilde o una
/// eñe, dos palabras seguidas, o es una palabra con mayúscula inicial— y no
/// está en las excepciones. Los mensajes del registro (`.info(`, `.error(`…)
/// no cuentan: no los ve el usuario.
///
/// Toda excepción va con su motivo, y una excepción que ya no se usa también
/// falla: la lista no se pudre.
final class VisibleTextTests: XCTestCase {
    private struct Exception {
        let file: String
        /// `nil`: el archivo entero.
        let text: String?
        let reason: String
    }

    private static let intentContract =
        "App Intent: título, descripción y parámetros son lo que se ve en Atajos y Siri, escrito en el intent"

    private static let exceptions: [Exception] = [
        // Texto de usuario de Atajos y Siri: va literal en el intent (ADR 0021).
        .init(
            file: "Coco/Features/Shortcuts/CocoShortcuts.swift", text: nil,
            reason: "Frases y títulos de los App Shortcuts: lo que se dice a Siri y se ve en Atajos"),
        .init(file: "Coco/Features/Shortcuts/RecordSMSExpenseIntent.swift", text: nil, reason: intentContract),
        .init(file: "Coco/Features/Shortcuts/RecordWalletExpenseIntent.swift", text: nil, reason: intentContract),
        .init(file: "Coco/Features/Shortcuts/RecordManualExpenseIntent.swift", text: nil, reason: intentContract),
        .init(file: "CocoWidgets/OpenCaptureIntent.swift", text: nil, reason: intentContract),
        // No los ve el usuario.
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
            text: "(typeof window.__coco?.ir === 'function') ? (window.__coco.ir(%@), true) : false;",
            reason: "JavaScript que se evalúa en la web"),
    ]

    // Calculada: un `Regex` no es `Sendable` y no puede ser una constante global.
    private static var logCall: Regex<(Substring, Substring)> { #/\.(debug|info|notice|warning|error|fault)\($/# }

    func testNoVisibleTextOutsideTheCatalog() throws {
        // Las carpetas van copiadas en el paquete de pruebas (project.yml).
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
                    guard Self.looksLikeText(literal.value), literal.preceding.firstMatch(of: Self.logCall) == nil
                    else { continue }
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
        XCTAssertEqual(violations, [], "Textos sueltos: pásalos a L10n y al catálogo, o añade una excepción")
        let unused = Self.exceptions.indices.filter { !used.contains($0) }.map {
            "\(Self.exceptions[$0].file) «\(Self.exceptions[$0].text ?? "*")»"
        }
        XCTAssertEqual(unused, [], "Excepciones que ya no hacen falta")
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
            """
        let found = SwiftLiterals.scan(source).filter {
            Self.looksLikeText($0.value) && $0.preceding.firstMatch(of: Self.logCall) == nil
        }
        XCTAssertEqual(found.map(\.value), ["Guardar", "Nuevo gasto"])
        XCTAssertEqual(found.map(\.line), [1, 2])
    }
}

/// Un lector mínimo de literales de Swift: salta comentarios, entra en las
/// interpolaciones (que se leen como `%@`) y entiende `"""` y las escapadas.
/// Basta para estas pruebas; no es un analizador de Swift.
enum SwiftLiterals {
    struct Literal: Equatable {
        let line: Int
        let value: String
        /// Lo que hay justo antes, sin espacios: para reconocer una llamada.
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

        /// `\` y salto de línea, dentro de `"""`, parte la línea sin añadir nada.
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
