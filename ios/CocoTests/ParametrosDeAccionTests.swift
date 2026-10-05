import XCTest
@testable import Coco

final class ParametrosDeAccionTests: XCTestCase {
    /// 2026-10-04 04:30 UTC == 2026-10-03 23:30 en Bogotá.
    private let nocheDeBogota = Date(timeIntervalSince1970: 1_791_088_200)

    func testWalletConTodo() {
        let c = ParametrosDeAccion.cuerpoDeWallet(comercio: "D1", monto: "$45.000", tarjeta: "Visa", nombre: "Compra", ahora: nocheDeBogota)
        XCTAssertEqual(c.comercio, "D1")
        XCTAssertEqual(c.monto, "45000")
        XCTAssertEqual(c.fecha, "2026-10-03")
        XCTAssertEqual(c.texto, "Wallet · Visa · Compra")
        XCTAssertTrue(c.esEnviable)
    }

    func testWalletSinMontoSigueSiendoEnviable() {
        let c = ParametrosDeAccion.cuerpoDeWallet(comercio: "D1", monto: nil, tarjeta: "Visa", nombre: nil, ahora: nocheDeBogota)
        XCTAssertNil(c.monto)
        XCTAssertTrue(c.esEnviable)
    }

    func testWalletSinComercioTomaElNombre() {
        let c = ParametrosDeAccion.cuerpoDeWallet(comercio: " ", monto: "45000", tarjeta: nil, nombre: "Rappi", ahora: nocheDeBogota)
        XCTAssertEqual(c.comercio, "Rappi")
    }

    func testWalletSinComercioNiNombreNoDejaElTextoVacio() {
        let c = ParametrosDeAccion.cuerpoDeWallet(comercio: nil, monto: nil, tarjeta: "Mastercard", nombre: nil, ahora: nocheDeBogota)
        XCTAssertNil(c.comercio)
        XCTAssertEqual(c.texto, "Wallet · Mastercard")
        XCTAssertTrue(c.esEnviable)
    }

    func testMontosEnVariosFormatos() {
        for (entrada, salida) in [("$45.000", "45000"), ("45000", "45000"), ("45.000,50", "45000.50"), ("COP 1.200.000", "1200000")] {
            XCTAssertEqual(ParametrosDeAccion.cuerpoDeWallet(comercio: "x", monto: entrada, tarjeta: nil, nombre: nil, ahora: nocheDeBogota).monto, salida, entrada)
        }
    }

    func testSMSConTexto() throws {
        let c = try ParametrosDeAccion.cuerpoDeSMS(texto: "Bancolombia: compra por $45.000 en D1", remitente: "891111", ahora: nocheDeBogota)
        XCTAssertEqual(c.texto, "Bancolombia: compra por $45.000 en D1")
        XCTAssertEqual(c.nota, "De: 891111")
        XCTAssertEqual(c.fecha, "2026-10-03")
        XCTAssertNil(c.comercio)
    }

    func testSMSVacioLanza() {
        XCTAssertThrowsError(try ParametrosDeAccion.cuerpoDeSMS(texto: "   \n", remitente: nil, ahora: nocheDeBogota)) { e in
            XCTAssertEqual(e as? ErrorDeParametros, .textoVacio)
        }
    }

    func testElIntentDeSMSVacioNoEncolaNada() async {
        let capturador = CapturadorDoble()
        do {
            _ = try await RegistrarGastoDeSMSIntent.ejecutar(texto: " ", remitente: nil, capturador: capturador)
            XCTFail("debería lanzar")
        } catch {}
        XCTAssertTrue(capturador.recibidas.isEmpty)
    }

    func testElIntentDeWalletEncolaConOrigenWallet() async {
        let capturador = CapturadorDoble()
        capturador.respuesta = .enCola(pendientes: 1)
        let r = await RegistrarGastoDeWalletIntent.ejecutar(comercio: "D1", monto: "$45.000", tarjeta: "Visa", nombre: nil, capturador: capturador, ahora: nocheDeBogota)
        XCTAssertEqual(r, .enCola(pendientes: 1))
        XCTAssertEqual(capturador.recibidas.first?.origen, .wallet)
        XCTAssertEqual(capturador.recibidas.first?.cuerpo.monto, "45000")
    }

    func testDialogos() {
        XCTAssertEqual(ParametrosDeAccion.textoDeDialogo(.enCola(pendientes: 1)), "Guardado en el teléfono; se enviará cuando haya red.")
        XCTAssertEqual(ParametrosDeAccion.textoDeDialogo(.enCola(pendientes: 3)), "Guardado en el teléfono; se enviará cuando haya red. 3 pendientes.")
        let g = ResultadoGuardado(transactionId: 1, resumen: "Gasto de $45.000 en D1", repetido: false, fusionado: false, porRevisar: false, terminadaEn: .now)
        XCTAssertEqual(ParametrosDeAccion.textoDeDialogo(.enviada(g)), "Gasto de $45.000 en D1")
        XCTAssertEqual(ParametrosDeAccion.textoDeDialogo(.fallida(motivo: "Falta el texto")), "No se pudo registrar: Falta el texto")
    }
}
