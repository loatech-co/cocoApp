import XCTest

@testable import Coco

/// Los textos pasaron del código a `Localizable.xcstrings` sin cambiar ni un
/// carácter. `localization-baseline.json` es la lista de ANTES: cada texto
/// sacado del código de la rama base (el commit va en `base`, y cada entrada
/// dice de qué línea salió), con sus interpolaciones como `%@`.
///
/// Si un texto cambia a propósito, se cambia aquí también y el diff lo enseña.
final class LocalizationTests: XCTestCase {
    private struct Entry: Decodable {
        let key: String
        let source: String
        let value: String
    }

    private struct Baseline: Decodable {
        let base: String
        let texts: [Entry]
    }

    private static let missing = "\u{1}falta"

    private func baseline() throws -> Baseline {
        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "localization-baseline", withExtension: "json"))
        return try JSONDecoder().decode(Baseline.self, from: Data(contentsOf: url))
    }

    private func extensionBundle() throws -> Bundle {
        let plugIns = try XCTUnwrap(Bundle.main.builtInPlugInsURL)
        return try XCTUnwrap(Bundle(url: plugIns.appending(path: "CocoWidgets.appex")))
    }

    private static func isExtension(_ entry: Entry) -> Bool {
        entry.source.hasPrefix("ios/CocoWidgets/")
    }

    func testEveryTextKeepsItsValue() throws {
        let baseline = try baseline()
        let extensionBundle = try extensionBundle()
        XCTAssertGreaterThan(baseline.texts.count, 100)
        for entry in baseline.texts {
            let bundle = Self.isExtension(entry) ? extensionBundle : Bundle.main
            let value = bundle.localizedString(forKey: entry.key, value: Self.missing, table: nil)
            XCTAssertEqual(value, entry.value, "\(entry.key), de \(entry.source)")
        }
    }

    /// Ni claves de sobra en el catálogo ni claves que el código pida y no
    /// estén. Se lee lo COMPILADO, que es lo que llega al teléfono.
    func testCatalogsHoldExactlyTheBaselineKeys() throws {
        let baseline = try baseline()
        for (bundle, isExtension) in [(Bundle.main, false), (try extensionBundle(), true)] {
            let url = try XCTUnwrap(
                bundle.url(forResource: "Localizable", withExtension: "strings", subdirectory: nil, localization: "es"))
            let compiled = try XCTUnwrap(NSDictionary(contentsOf: url) as? [String: String])
            let expected = Set(baseline.texts.filter { Self.isExtension($0) == isExtension }.map(\.key))
            XCTAssertEqual(Set(compiled.keys), expected, bundle.bundlePath)
        }
    }

    func testFormatsFillTheirPlaceholdersInOrder() {
        XCTAssertEqual(L10n.Captures.rowFailed("2026-10-05", reason: "Sin conexión"), "2026-10-05 · Sin conexión")
        XCTAssertEqual(L10n.Settings.expiryInDays("5 oct 2026", days: 12), "5 oct 2026 · quedan 12 días")
        XCTAssertEqual(L10n.Queue.errorServer(503), "La API no pudo ahora (503)")
        XCTAssertEqual(L10n.Notifications.queueSentMany(1200), "Se enviaron 1200 capturas pendientes")
        XCTAssertEqual(L10n.Offline.pendingMany(3), " 3 pendientes.")
    }
}
