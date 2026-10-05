import XCTest

@testable import Coco

/// Las claves con las que se escriben en disco la cola y el árbol, y con las
/// que viajan a la API. Si un renombre del código las cambia, una captura que
/// ya estaba en la cola de alguien deja de leerse al actualizar la app. Las
/// cadenas de aquí son el contrato: no se tocan para que una prueba pase.
final class StoredFormatCompatibilityTests: XCTestCase {
    private func json<T: Encodable>(_ value: T) throws -> String {
        let jsonEncoder = JSONEncoder()
        jsonEncoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try XCTUnwrap(String(data: jsonEncoder.encode(value), encoding: .utf8))
    }

    private func roundTrip<T: Codable & Equatable>(_ value: T, _ expected: String, line: UInt = #line) throws {
        XCTAssertEqual(try json(value), expected, line: line)
        XCTAssertEqual(try JSONDecoder().decode(T.self, from: Data(expected.utf8)), value, line: line)
    }

    private static let result = SavedResult(
        transactionId: 9, summary: "r", duplicate: false, merged: true, needsReview: true,
        finishedAt: Date(timeIntervalSinceReferenceDate: 100))

    private static let body = CaptureBody(
        text: "t", merchant: "c", amount: "1", date: "2026-01-02", period: "2026-01", fileName: "f.jpg",
        categoryId: 3, note: "n")

    private func pending(_ phase: PendingCapture.Phase) -> PendingCapture {
        PendingCapture(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000001") ?? UUID(),
            createdAt: Date(timeIntervalSinceReferenceDate: 0), source: .iosPhoto, body: Self.body,
            photoPath: "Fotos/x.jpg", phase: phase, attempts: 2,
            nextAttempt: Date(timeIntervalSinceReferenceDate: 50),
            lastError: "e", textResult: Self.result)
    }

    func testThePendingCaptureKeepsItsKeysInEveryPhase() throws {
        let base =
            #"{"creadaEn":0,"cuerpo":{"category_id":3,"comercio":"c","fecha":"2026-01-02","monto":"1","nombre_de_archivo":"f.jpg","nota":"n","periodo":"2026-01","texto":"t"},"fase":FASE,"fotoRelativa":"Fotos/x.jpg","id":"00000000-0000-0000-0000-000000000001","intentos":2,"origen":"ios_photo","proximoIntento":50,"resultadoDeTexto":{"fusionado":true,"porRevisar":true,"repetido":false,"resumen":"r","terminadaEn":100,"transactionId":9},"ultimoError":"e"}"#
        let result =
            #"{"fusionado":true,"porRevisar":true,"repetido":false,"resumen":"r","terminadaEn":100,"transactionId":9}"#
        let phases: [(PendingCapture.Phase, String)] = [
            (.toSend, #"{"porEnviar":{}}"#),
            (.photoToUpload(transactionId: 4), #"{"porSubirFoto":{"transactionId":4}}"#),
            (.awaitingSession, #"{"esperandoSesion":{}}"#),
            (.done(Self.result), #"{"hecha":{"_0":RES}}"#.replacingOccurrences(of: "RES", with: result)),
            (.failed(reason: "m"), #"{"fallida":{"motivo":"m"}}"#),
        ]
        for (phase, key) in phases {
            try roundTrip(pending(phase), base.replacingOccurrences(of: "FASE", with: key))
        }
    }

    func testTheSavedTreeKeepsItsKeys() throws {
        let tree = SavedTree(
            roots: [
                TreeNode(
                    id: 1, name: "A", parentId: nil, keywords: ["k"], isArchived: true, isStatic: true,
                    children: [TreeNode(id: 2, name: "B", parentId: 1)])
            ],
            downloadedAt: Date(timeIntervalSinceReferenceDate: 7))
        try roundTrip(
            tree,
            #"{"descargadoEn":7,"raices":[{"children":[{"estatico":false,"id":2,"is_archived":false,"name":"B","palabras_clave":[],"parent_id":1}],"estatico":true,"id":1,"is_archived":true,"name":"A","palabras_clave":["k"]}]}"#
        )
    }

    func testTheValuesTheAppSendsDoNotChange() throws {
        XCTAssertEqual(CaptureSource.wallet.rawValue, "wallet")
        XCTAssertEqual(CaptureSource.sms.rawValue, "sms")
        XCTAssertEqual(CaptureSource.iosManual.rawValue, "ios_manual")
        XCTAssertEqual(CaptureSource.iosPhoto.rawValue, "ios_photo")
        XCTAssertEqual(TreeLevel.center.rawValue, "centro")
        XCTAssertEqual(TreeLevel.category.rawValue, "categoria")
        XCTAssertEqual(TreeLevel.concept.rawValue, "concepto")
        XCTAssertEqual(KeychainKey.refreshToken.rawValue, "refresh_token")
    }

    func testTheProfileKeepsItsKeys() throws {
        let profile = PublicProfile(
            id: 7, email: "x@coco.invalid", displayName: "X", role: "owner", status: "active", createdAt: "2026")
        try roundTrip(
            profile,
            #"{"created_at":"2026","display_name":"X","email":"x@coco.invalid","id":7,"role":"owner","status":"active"}"#
        )
    }

    func testTheAPIResponsesKeepTheirKeys() throws {
        let classification = ProposedClassification(
            confidence: "alta", source: "f", conceptId: 1, categoryId: 2, name: "n",
            candidates: [.init(id: 3, name: "c", path: "r")], reason: "m")
        let classificationJSON =
            #"{"candidatos":[{"id":3,"nombre":"c","ruta":"r"}],"categoria_id":2,"certeza":"alta","concepto_id":1,"fuente":"f","motivo":"m","nombre":"n"}"#
        try roundTrip(classification, classificationJSON)
        try roundTrip(
            Interpretation(
                amount: "1", date: "d", merchant: "m", description: "x", classification: classification,
                needsReview: true
            ),
            #"{"amount":"1","clasificacion":CL,"date":"d","description":"x","merchant":"m","por_revisar":true}"#
                .replacingOccurrences(of: "CL", with: classificationJSON))
        let transaction = TransactionSummary(
            id: 1, date: "d", amount: "2", categoryId: 3, description: "x", merchant: "m", source: "sms",
            needsReview: false)
        let transactionJSON =
            #"{"amount":"2","category_id":3,"date":"d","description":"x","id":1,"merchant":"m","por_revisar":false,"source":"sms"}"#
        try roundTrip(transaction, transactionJSON)
        try roundTrip(
            CaptureResponse(
                transaction: transaction, classification: classification, summary: "r", duplicate: true, merged: false),
            #"{"clasificacion":CL,"fusionado":false,"repetido":true,"resumen":"r","transaction":TR}"#
                .replacingOccurrences(of: "CL", with: classificationJSON).replacingOccurrences(
                    of: "TR", with: transactionJSON))
        try roundTrip(
            Attachment(id: 1, order: 2, fileName: "a", mimeType: "image/jpeg", size: 3, available: true),
            #"{"disponible":true,"id":1,"mime_type":"image/jpeg","nombre_archivo":"a","orden":2,"tamano":3}"#)
        let session = try JSONDecoder().decode(
            SessionResponse.self,
            from: Data(
                #"{"access_token":"a","expires_in":5,"refresh_token":"r","user":{"created_at":"c","display_name":null,"email":"e","id":1,"role":"owner","status":"active"}}"#
                    .utf8))
        XCTAssertEqual(session.accessToken, "a")
        XCTAssertEqual(session.expiresIn, 5)
        XCTAssertEqual(session.refreshToken, "r")
        XCTAssertEqual(session.user.createdAt, "c")
    }
}
