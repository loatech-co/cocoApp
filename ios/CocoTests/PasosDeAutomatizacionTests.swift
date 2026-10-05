import XCTest

@testable import Coco

final class PasosDeAutomatizacionTests: XCTestCase {
    private let grupos: [(String, [PasoDeAutomatizacion])] = [
        ("transaccion", PasosDeAutomatizacion.transaccion),
        ("mensaje", PasosDeAutomatizacion.mensaje),
        ("accesos", PasosDeAutomatizacion.accesos),
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
        let wallet = PasosDeAutomatizacion.transaccion.map { $0.titulo + " " + $0.detalle }.joined(separator: " ")
        for campo in ["Comercio", "Monto", "Tarjeta", "Nombre"] {
            XCTAssertTrue(wallet.contains(campo), campo)
        }
        let sms = PasosDeAutomatizacion.mensaje.map { $0.titulo + " " + $0.detalle }.joined(separator: " ")
        for campo in ["Texto", "Remitente"] {
            XCTAssertTrue(sms.contains(campo), campo)
        }
    }

    func testAmbasMencionanEjecutarDeInmediato() {
        for pasos in [PasosDeAutomatizacion.transaccion, PasosDeAutomatizacion.mensaje] {
            XCTAssertTrue(pasos.contains { $0.detalle.contains("Ejecutar de inmediato") })
        }
    }

    @MainActor
    func testAbrirAtajosUsaElEsquemaShortcuts() {
        var abierta: URL?
        AbrirAtajos.abrir(con: { abierta = $0 })
        XCTAssertEqual(abierta?.scheme, "shortcuts")
    }

    func testLaClaveDeBienvenida() {
        let defaults = UserDefaults(suiteName: "co.loatech.coco.pruebas.bienvenida") ?? .standard
        defaults.removeObject(forKey: BienvenidaView.clave)
        XCTAssertFalse(BienvenidaView.yaVista(defaults: defaults))
        defaults.set(true, forKey: BienvenidaView.clave)
        XCTAssertTrue(BienvenidaView.yaVista(defaults: defaults))
    }
}
