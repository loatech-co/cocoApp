import XCTest

@testable import Coco

final class ActionParametersTests: XCTestCase {
    /// 2026-10-04 04:30 UTC == 2026-10-03 23:30 en Bogotá.
    private let bogotaNight = Date(timeIntervalSince1970: 1_791_088_200)

    func testWalletWithEverything() {
        let c = ActionParameters.walletBody(
            merchant: "D1", amount: "$45.000", card: "Visa", name: "Compra", now: bogotaNight)
        XCTAssertEqual(c.merchant, "D1")
        XCTAssertEqual(c.amount, "45000")
        XCTAssertEqual(c.date, "2026-10-03")
        XCTAssertEqual(c.text, "Wallet · Visa · Compra")
        XCTAssertTrue(c.isSendable)
    }

    func testWalletWithoutAmountIsStillSendable() {
        let c = ActionParameters.walletBody(
            merchant: "D1", amount: nil, card: "Visa", name: nil, now: bogotaNight)
        XCTAssertNil(c.amount)
        XCTAssertTrue(c.isSendable)
    }

    func testWalletWithoutMerchantTakesTheName() {
        let c = ActionParameters.walletBody(
            merchant: " ", amount: "45000", card: nil, name: "Rappi", now: bogotaNight)
        XCTAssertEqual(c.merchant, "Rappi")
    }

    func testWalletWithoutMerchantOrNameDoesNotLeaveTheTextEmpty() {
        let c = ActionParameters.walletBody(
            merchant: nil, amount: nil, card: "Mastercard", name: nil, now: bogotaNight)
        XCTAssertNil(c.merchant)
        XCTAssertEqual(c.text, "Wallet · Mastercard")
        XCTAssertTrue(c.isSendable)
    }

    func testAmountsInSeveralFormats() {
        for (entry, output) in [
            ("$45.000", "45000"), ("45000", "45000"), ("45.000,50", "45000.50"), ("COP 1.200.000", "1200000"),
        ] {
            XCTAssertEqual(
                ActionParameters.walletBody(
                    merchant: "x", amount: entry, card: nil, name: nil, now: bogotaNight
                ).amount, output, entry)
        }
    }

    func testSMSWithText() throws {
        let c = try ActionParameters.smsBody(
            text: "Bancolombia: compra por $45.000 en D1", sender: "891111", now: bogotaNight)
        XCTAssertEqual(c.text, "Bancolombia: compra por $45.000 en D1")
        XCTAssertEqual(c.note, "De: 891111")
        XCTAssertEqual(c.date, "2026-10-03")
        XCTAssertNil(c.merchant)
    }

    func testEmptySMSThrows() {
        XCTAssertThrowsError(
            try ActionParameters.smsBody(text: "   \n", sender: nil, now: bogotaNight)
        ) { e in
            XCTAssertEqual(e as? ParameterError, .emptyText)
        }
    }

    func testTheEmptySMSIntentEnqueuesNothing() async {
        let capturer = CapturerDouble()
        do {
            _ = try await RegistrarGastoDeSMSIntent.run(text: " ", sender: nil, capturer: capturer)
            XCTFail("debería lanzar")
        } catch {}
        XCTAssertTrue(capturer.received.isEmpty)
    }

    func testTheWalletIntentEnqueuesWithWalletSource() async {
        let capturer = CapturerDouble()
        capturer.response = .queued(pending: 1)
        let r = await RegistrarGastoDeWalletIntent.run(
            merchant: "D1", amount: "$45.000", card: "Visa", name: nil, capturer: capturer, now: bogotaNight
        )
        XCTAssertEqual(r, .queued(pending: 1))
        XCTAssertEqual(capturer.received.first?.source, .wallet)
        XCTAssertEqual(capturer.received.first?.body.amount, "45000")
    }

    func testDialogs() {
        XCTAssertEqual(
            ActionParameters.dialogText(.queued(pending: 1)),
            "Guardado en el teléfono; se enviará cuando haya red.")
        XCTAssertEqual(
            ActionParameters.dialogText(.queued(pending: 3)),
            "Guardado en el teléfono; se enviará cuando haya red. 3 pendientes.")
        let g = SavedResult(
            transactionId: 1, summary: "Gasto de $45.000 en D1", duplicate: false, merged: false, needsReview: false,
            finishedAt: .now)
        XCTAssertEqual(ActionParameters.dialogText(.sent(g)), "Gasto de $45.000 en D1")
        XCTAssertEqual(
            ActionParameters.dialogText(.failed(reason: "Falta el texto")),
            "No se pudo registrar: Falta el texto")
    }
}
