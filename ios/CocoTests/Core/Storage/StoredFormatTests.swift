import XCTest

@testable import Coco

/// Las claves con las que se escriben en disco la cola y el árbol. La cola usa
/// las sintetizadas —los nombres de las propiedades, en inglés—, `body`
/// incluido: no depende del contrato con la API, que se traduce al enviar.
/// El árbol es una copia del servidor y guarda las claves de `TreeNode`, que
/// fija `APIKeysTests`.
///
/// Si un renombre del código cambia una clave, una captura que ya estaba en la
/// cola deja de leerse al actualizar la app. Las cadenas de aquí son el
/// formato: no se tocan para que una prueba pase.
final class StoredFormatTests: XCTestCase {
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
            photoPath: "Photos/x.jpg", phase: phase, attempts: 2,
            nextAttempt: Date(timeIntervalSinceReferenceDate: 50),
            lastError: "e", textResult: Self.result)
    }

    func testThePendingCaptureKeepsItsKeysInEveryPhase() throws {
        let base =
            #"{"attempts":2,"body":{"amount":"1","categoryId":3,"date":"2026-01-02","fileName":"f.jpg","merchant":"c","note":"n","period":"2026-01","text":"t"},"createdAt":0,"id":"00000000-0000-0000-0000-000000000001","lastError":"e","nextAttempt":50,"phase":PHASE,"photoPath":"Photos/x.jpg","source":"ios_photo","textResult":{"duplicate":false,"finishedAt":100,"merged":true,"needsReview":true,"summary":"r","transactionId":9},"version":1}"#
        let result =
            #"{"duplicate":false,"finishedAt":100,"merged":true,"needsReview":true,"summary":"r","transactionId":9}"#
        let phases: [(PendingCapture.Phase, String)] = [
            (.toSend, #"{"toSend":{}}"#),
            (.photoToUpload(transactionId: 4), #"{"photoToUpload":{"transactionId":4}}"#),
            (.awaitingSession, #"{"awaitingSession":{}}"#),
            (.done(Self.result), #"{"done":{"_0":RES}}"#.replacingOccurrences(of: "RES", with: result)),
            (.unconfirmed(at: Date(timeIntervalSinceReferenceDate: 60)), #"{"unconfirmed":{"at":60}}"#),
            (.failed(reason: "m"), #"{"failed":{"reason":"m"}}"#),
        ]
        for (phase, key) in phases {
            try roundTrip(pending(phase), base.replacingOccurrences(of: "PHASE", with: key))
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
            #"{"downloadedAt":7,"roots":[{"children":[{"id":2,"isArchived":false,"isStatic":false,"keywords":[],"name":"B","parentId":1}],"id":1,"isArchived":true,"isStatic":true,"keywords":["k"],"name":"A"}]}"#
        )
    }

    /// Dónde vive cada cosa en el teléfono: el nombre es parte del formato.
    func testTheStorageNamesDoNotChange() {
        XCTAssertEqual(KeychainKey.refreshToken.rawValue, "refresh_token")
        XCTAssertEqual(SystemKeychain.defaultService, "co.loatech.coco")
        XCTAssertEqual(APIConfiguration.defaultsKey, "api-base-url")
        XCTAssertEqual(RecentsStore.key, "co.loatech.coco.recentConcepts")
        XCTAssertEqual(BackgroundJobs.refresh, "co.loatech.coco.refresh")
        XCTAssertEqual(BackgroundJobs.queue, "co.loatech.coco.queue")
        XCTAssertEqual(DiskQueueStore.folderName, "Queue")
        XCTAssertEqual(DiskQueueStore.photosFolderName, "Photos")
        XCTAssertEqual(DiskQueueStore.quarantineFolderName, "Quarantine")
        XCTAssertEqual(PendingCapture.formatVersion, 1)
        XCTAssertEqual(DiskTreeStore.fileName, "tree.json")
        XCTAssertEqual(WelcomeView.key, "welcome-seen")
        XCTAssertEqual(Dependencies.permissionAskedKey, "notification-permission-requested")
    }
}
