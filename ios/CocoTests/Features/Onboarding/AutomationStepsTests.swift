import XCTest

@testable import Coco

final class AutomationStepsTests: XCTestCase {
    private let groups: [(String, [AutomationStep])] = [
        ("transaccion", AutomationSteps.transaccion),
        ("mensaje", AutomationSteps.message),
        ("accesos", AutomationSteps.accesos),
    ]

    func testIdsUnicosYConsecutivos() {
        for (name, pasos) in groups {
            XCTAssertEqual(pasos.map(\.id), Array(1...pasos.count), name)
        }
    }

    func testNingunTituloEnMayusculasSostenidas() {
        for (_, pasos) in groups {
            for paso in pasos {
                XCTAssertNotEqual(paso.titulo, paso.titulo.uppercased(), paso.titulo)
                XCTAssertFalse(paso.titulo.isEmpty)
                XCTAssertFalse(paso.detalle.isEmpty)
                XCTAssertFalse(paso.simbolo.isEmpty)
            }
        }
    }

    func testWalletNombraLosCuatroCamposYSMSLosDos() {
        let wallet = AutomationSteps.transaccion.map { $0.titulo + " " + $0.detalle }.joined(separator: " ")
        for campo in ["Comercio", "Monto", "Tarjeta", "Nombre"] {
            XCTAssertTrue(wallet.contains(campo), campo)
        }
        let sms = AutomationSteps.message.map { $0.titulo + " " + $0.detalle }.joined(separator: " ")
        for campo in ["Texto", "Remitente"] {
            XCTAssertTrue(sms.contains(campo), campo)
        }
    }

    func testAmbasMencionanEjecutarDeInmediato() {
        for pasos in [AutomationSteps.transaccion, AutomationSteps.message] {
            XCTAssertTrue(pasos.contains { $0.detalle.contains("Ejecutar de inmediato") })
        }
    }

    @MainActor
    func testAbrirAtajosUsaElEsquemaShortcuts() {
        var abierta: URL?
        ShortcutsLauncher.abrir(con: { abierta = $0 })
        XCTAssertEqual(abierta?.scheme, "shortcuts")
    }

    func testLaClaveDeBienvenida() {
        let defaults = UserDefaults(suiteName: "co.loatech.coco.pruebas.bienvenida") ?? .standard
        defaults.removeObject(forKey: WelcomeView.key)
        XCTAssertFalse(WelcomeView.yaVista(defaults: defaults))
        defaults.set(true, forKey: WelcomeView.key)
        XCTAssertTrue(WelcomeView.yaVista(defaults: defaults))
    }
}
