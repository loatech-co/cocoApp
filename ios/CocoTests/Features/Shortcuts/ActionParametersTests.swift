import XCTest

@testable import Coco

final class ActionParametersTests: XCTestCase {
    /// 2026-10-04 04:30 UTC == 2026-10-03 23:30 en Bogotá.
    private let nocheDeBogota = Date(timeIntervalSince1970: 1_791_088_200)

    func testWalletConTodo() {
        let c = ActionParameters.cuerpoDeWallet(
            merchant: "D1", amount: "$45.000", tarjeta: "Visa", name: "Compra", now: nocheDeBogota)
        XCTAssertEqual(c.merchant, "D1")
        XCTAssertEqual(c.amount, "45000")
        XCTAssertEqual(c.date, "2026-10-03")
        XCTAssertEqual(c.text, "Wallet · Visa · Compra")
        XCTAssertTrue(c.isSendable)
    }

    func testWalletSinMontoSigueSiendoEnviable() {
        let c = ActionParameters.cuerpoDeWallet(
            merchant: "D1", amount: nil, tarjeta: "Visa", name: nil, now: nocheDeBogota)
        XCTAssertNil(c.amount)
        XCTAssertTrue(c.isSendable)
    }

    func testWalletSinComercioTomaElNombre() {
        let c = ActionParameters.cuerpoDeWallet(
            merchant: " ", amount: "45000", tarjeta: nil, name: "Rappi", now: nocheDeBogota)
        XCTAssertEqual(c.merchant, "Rappi")
    }

    func testWalletSinComercioNiNombreNoDejaElTextoVacio() {
        let c = ActionParameters.cuerpoDeWallet(
            merchant: nil, amount: nil, tarjeta: "Mastercard", name: nil, now: nocheDeBogota)
        XCTAssertNil(c.merchant)
        XCTAssertEqual(c.text, "Wallet · Mastercard")
        XCTAssertTrue(c.isSendable)
    }

    func testMontosEnVariosFormatos() {
        for (entry, output) in [
            ("$45.000", "45000"), ("45000", "45000"), ("45.000,50", "45000.50"), ("COP 1.200.000", "1200000"),
        ] {
            XCTAssertEqual(
                ActionParameters.cuerpoDeWallet(
                    merchant: "x", amount: entry, tarjeta: nil, name: nil, now: nocheDeBogota
                ).amount, output, entry)
        }
    }

    func testSMSConTexto() throws {
        let c = try ActionParameters.cuerpoDeSMS(
            text: "Bancolombia: compra por $45.000 en D1", remitente: "891111", now: nocheDeBogota)
        XCTAssertEqual(c.text, "Bancolombia: compra por $45.000 en D1")
        XCTAssertEqual(c.note, "De: 891111")
        XCTAssertEqual(c.date, "2026-10-03")
        XCTAssertNil(c.merchant)
    }

    func testSMSVacioLanza() {
        XCTAssertThrowsError(
            try ActionParameters.cuerpoDeSMS(text: "   \n", remitente: nil, now: nocheDeBogota)
        ) { e in
            XCTAssertEqual(e as? ParameterError, .textoVacio)
        }
    }

    func testElIntentDeSMSVacioNoEncolaNada() async {
        let capturer = CapturerDouble()
        do {
            _ = try await RegistrarGastoDeSMSIntent.run(text: " ", remitente: nil, capturer: capturer)
            XCTFail("debería lanzar")
        } catch {}
        XCTAssertTrue(capturer.received.isEmpty)
    }

    func testElIntentDeWalletEncolaConOrigenWallet() async {
        let capturer = CapturerDouble()
        capturer.response = .queued(pending: 1)
        let r = await RegistrarGastoDeWalletIntent.run(
            merchant: "D1", amount: "$45.000", tarjeta: "Visa", name: nil, capturer: capturer, now: nocheDeBogota
        )
        XCTAssertEqual(r, .queued(pending: 1))
        XCTAssertEqual(capturer.received.first?.source, .wallet)
        XCTAssertEqual(capturer.received.first?.body.amount, "45000")
    }

    func testDialogos() {
        XCTAssertEqual(
            ActionParameters.textoDeDialogo(.queued(pending: 1)),
            "Guardado en el teléfono; se enviará cuando haya red.")
        XCTAssertEqual(
            ActionParameters.textoDeDialogo(.queued(pending: 3)),
            "Guardado en el teléfono; se enviará cuando haya red. 3 pendientes.")
        let g = SavedResult(
            transactionId: 1, summary: "Gasto de $45.000 en D1", duplicate: false, merged: false, needsReview: false,
            finishedAt: .now)
        XCTAssertEqual(ActionParameters.textoDeDialogo(.sent(g)), "Gasto de $45.000 en D1")
        XCTAssertEqual(
            ActionParameters.textoDeDialogo(.failed(reason: "Falta el texto")),
            "No se pudo registrar: Falta el texto")
    }
}
