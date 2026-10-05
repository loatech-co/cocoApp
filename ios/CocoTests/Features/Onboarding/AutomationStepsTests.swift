import XCTest

@testable import Coco

final class AutomationStepsTests: XCTestCase {
    private let grupos: [(String, [AutomationStep])] = [
        ("transaccion", AutomationSteps.transaccion),
        ("mensaje", AutomationSteps.mensaje),
        ("accesos", AutomationSteps.accesos),
    ]

    func testIdsUnicosYConsecutivos() {
        for (nombre, pasos) in grupos {
            XCTAssertEqual(pasos.map(\.id), Array(1...pasos.count), nombre)
        }
    }

    func testNingunTituloEnMayusculasSostenidas() {
        for (_, pasos) in grupos {
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
        let sms = AutomationSteps.mensaje.map { $0.titulo + " " + $0.detalle }.joined(separator: " ")
        for campo in ["Texto", "Remitente"] {
            XCTAssertTrue(sms.contains(campo), campo)
        }
    }

    func testAmbasMencionanEjecutarDeInmediato() {
        for pasos in [AutomationSteps.transaccion, AutomationSteps.mensaje] {
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
        defaults.removeObject(forKey: WelcomeView.clave)
        XCTAssertFalse(WelcomeView.yaVista(defaults: defaults))
        defaults.set(true, forKey: WelcomeView.clave)
        XCTAssertTrue(WelcomeView.yaVista(defaults: defaults))
    }
}
