import XCTest

@testable import Coco

/// Las claves JSON del contrato `v2` con la API (`api/openapi.v2.json`), en los
/// dos sentidos: lo que la app manda y lo que lee. Cambiar una aquí rompe las
/// capturas contra la API desplegada: las cadenas de esta prueba son el
/// contrato y no se tocan para que pase (ADR 0002).
final class APIKeysTests: XCTestCase {
    private func json<T: Encodable>(_ value: T) throws -> String {
        let jsonEncoder = JSONEncoder()
        jsonEncoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try XCTUnwrap(String(data: jsonEncoder.encode(value), encoding: .utf8))
    }

    private func roundTrip<T: Codable & Equatable>(_ value: T, _ expected: String, line: UInt = #line) throws {
        XCTAssertEqual(try json(value), expected, line: line)
        XCTAssertEqual(try JSONDecoder().decode(T.self, from: Data(expected.utf8)), value, line: line)
    }

    private static let body = CaptureBody(
        text: "t", merchant: "c", amount: "1", date: "2026-01-02", period: "2026-01", fileName: "f.jpg",
        categoryId: 3, note: "n")

    /// `CaptureInput`: el cuerpo aplanado junto a `source`, `externalRef` y
    /// `capturedAt`, con `categoryId` como cadena de dígitos.
    func testTheCaptureRequestUsesTheV2Keys() throws {
        let request = CaptureRequest(source: .sms, externalRef: "x", capturedAt: "2026", body: Self.body)
        XCTAssertEqual(
            try json(request),
            #"{"amount":"1","capturedAt":"2026","categoryId":"3","date":"2026-01-02","externalRef":"x","fileName":"f.jpg","merchant":"c","note":"n","period":"2026-01","source":"sms","text":"t"}"#
        )
    }

    /// `InterpretInput`: sin `categoryId` ni `note`, que la v2 no acepta ahí.
    func testTheInterpretRequestUsesTheV2Keys() throws {
        XCTAssertEqual(
            try json(InterpretRequest(body: Self.body)),
            #"{"amount":"1","date":"2026-01-02","fileName":"f.jpg","merchant":"c","period":"2026-01","text":"t"}"#)
    }

    func testTheHeadersAndFieldsTheAppSends() throws {
        XCTAssertEqual(RequestBuilder.nativeClientHeader, "X-Coco-Client")
        XCTAssertEqual(RequestBuilder.nativeClient, "native")
        XCTAssertEqual(RequestBuilder.attachmentsField, "files")
        XCTAssertEqual(RequestBuilder.receiptsPath(transactionId: 4), "/transactions/4/receipts")
        let refresh = try XCTUnwrap(RequestBuilder.refresh(refreshToken: "r").jsonBody)
        XCTAssertEqual(String(data: refresh, encoding: .utf8), #"{"refreshToken":"r"}"#)
    }

    func testTheValuesTheAppSendsDoNotChange() {
        XCTAssertEqual(CaptureSource.wallet.rawValue, "wallet")
        XCTAssertEqual(CaptureSource.sms.rawValue, "sms")
        XCTAssertEqual(CaptureSource.iosManual.rawValue, "ios_manual")
        XCTAssertEqual(CaptureSource.iosPhoto.rawValue, "ios_photo")
    }

    func testTheProfileKeepsItsKeys() throws {
        let profile = PublicProfile(
            id: 7, email: "x@coco.invalid", displayName: "X", role: "admin", status: "active", createdAt: "2026")
        try roundTrip(
            profile,
            #"{"createdAt":"2026","displayName":"X","email":"x@coco.invalid","id":7,"role":"admin","status":"active"}"#
        )
    }

    func testTheCategoryTreeKeepsItsKeys() throws {
        try roundTrip(
            TreeNode(
                id: 1, name: "A", parentId: nil, keywords: ["k"], isArchived: true, isStatic: true,
                children: [TreeNode(id: 2, name: "B", parentId: 1)]),
            #"{"children":[{"id":2,"isArchived":false,"isStatic":false,"keywords":[],"name":"B","parentId":1}],"id":1,"isArchived":true,"isStatic":true,"keywords":["k"],"name":"A"}"#
        )
    }

    func testTheAPIResponsesKeepTheirKeys() throws {
        let classification = ProposedClassification(
            confidence: "high", source: "keywords", conceptId: 1, categoryId: 2, name: "n",
            candidates: [.init(id: 3, name: "c", path: "r")], reason: "m")
        let classificationJSON =
            #"{"candidates":[{"id":3,"name":"c","path":"r"}],"categoryId":2,"certainty":"high","conceptId":1,"name":"n","reason":"m","source":"keywords"}"#
        try roundTrip(classification, classificationJSON)
        try roundTrip(
            Interpretation(
                amount: "1", date: "d", merchant: "m", description: "x", classification: classification,
                needsReview: true
            ),
            #"{"amount":"1","classification":CL,"date":"d","description":"x","merchant":"m","needsReview":true}"#
                .replacingOccurrences(of: "CL", with: classificationJSON))
        let transaction = TransactionSummary(
            id: 1, date: "d", amount: "2", categoryId: 3, description: "x", merchant: "m", source: "sms",
            needsReview: false)
        let transactionJSON =
            #"{"amount":"2","categoryId":3,"date":"d","description":"x","id":1,"merchant":"m","needsReview":false,"source":"sms"}"#
        try roundTrip(transaction, transactionJSON)
        try roundTrip(
            CaptureResponse(
                transaction: transaction, classification: classification, summary: "r", duplicate: true, merged: false),
            #"{"classification":CL,"isDuplicate":true,"isMerged":false,"summary":"r","transaction":TR}"#
                .replacingOccurrences(of: "CL", with: classificationJSON).replacingOccurrences(
                    of: "TR", with: transactionJSON))
        try roundTrip(
            Attachment(id: 1, order: 2, fileName: "a", mimeType: "image/jpeg", size: 3, available: true),
            #"{"fileName":"a","id":1,"isAvailable":true,"mimeType":"image/jpeg","position":2,"sizeBytes":3}"#)
        let session = try JSONDecoder().decode(
            SessionResponse.self,
            from: Data(
                #"{"accessToken":"a","expiresIn":5,"refreshToken":"r","user":{"createdAt":"c","displayName":null,"email":"e","id":1,"role":"admin","status":"active"}}"#
                    .utf8))
        XCTAssertEqual(session.accessToken, "a")
        XCTAssertEqual(session.expiresIn, 5)
        XCTAssertEqual(session.refreshToken, "r")
        XCTAssertEqual(session.user.createdAt, "c")
    }

    /// Las listas de la v2 traen `meta.{page, perPage, total}`.
    func testAPageCarriesItsMeta() throws {
        let page = try JSONDecoder().decode(
            Page<TreeNode>.self,
            from: Data(#"{"data":[],"meta":{"page":2,"perPage":200,"total":201}}"#.utf8))
        XCTAssertEqual(page.meta.page, 2)
        XCTAssertEqual(page.meta.perPage, 200)
        XCTAssertEqual(page.meta.total, 201)
    }
}
