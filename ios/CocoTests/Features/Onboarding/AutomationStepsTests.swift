import XCTest

@testable import Coco

final class AutomationStepsTests: XCTestCase {
    private let groups: [(String, [AutomationStep])] = [
        ("transaccion", AutomationSteps.transaction),
        ("mensaje", AutomationSteps.message),
        ("accesos", AutomationSteps.accessPoints),
    ]

    func testIdsAreUniqueAndConsecutive() {
        for (name, steps) in groups {
            XCTAssertEqual(steps.map(\.id), Array(1...steps.count), name)
        }
    }

    func testNoTitleInAllCaps() {
        for (_, steps) in groups {
            for step in steps {
                XCTAssertNotEqual(step.title, step.title.uppercased(), step.title)
                XCTAssertFalse(step.title.isEmpty)
                XCTAssertFalse(step.detail.isEmpty)
                XCTAssertFalse(step.symbol.isEmpty)
            }
        }
    }

    func testWalletNamesTheFourFieldsAndSMSTheTwo() {
        let wallet = AutomationSteps.transaction.map { $0.title + " " + $0.detail }.joined(separator: " ")
        for field in ["Comercio", "Monto", "Tarjeta", "Nombre"] {
            XCTAssertTrue(wallet.contains(field), field)
        }
        let sms = AutomationSteps.message.map { $0.title + " " + $0.detail }.joined(separator: " ")
        for field in ["Texto", "Remitente"] {
            XCTAssertTrue(sms.contains(field), field)
        }
    }

    func testBothMentionRunImmediately() {
        for steps in [AutomationSteps.transaction, AutomationSteps.message] {
            XCTAssertTrue(steps.contains { $0.detail.contains("Ejecutar de inmediato") })
        }
    }

    @MainActor
    func testOpenShortcutsUsesTheShortcutsScheme() {
        var opened: URL?
        ShortcutsLauncher.open(with: { opened = $0 })
        XCTAssertEqual(opened?.scheme, "shortcuts")
    }

    func testTheWelcomeKey() {
        let defaults = UserDefaults(suiteName: "co.loatech.coco.pruebas.bienvenida") ?? .standard
        defaults.removeObject(forKey: WelcomeView.key)
        XCTAssertFalse(WelcomeView.wasSeen(defaults: defaults))
        defaults.set(true, forKey: WelcomeView.key)
        XCTAssertTrue(WelcomeView.wasSeen(defaults: defaults))
    }
}
