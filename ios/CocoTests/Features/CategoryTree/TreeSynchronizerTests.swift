import XCTest

@testable import Coco

final class TreeSynchronizerTests: XCTestCase {
    /// Una sesión que siempre tiene token: aquí se prueba el árbol, no la sesión.
    private final class FixedSession: Session, @unchecked Sendable {
        var state: SessionState { .signedOut }
        let changes: AsyncStream<SessionState> = AsyncStream { $0.finish() }
        func restore() async {}
        func signIn(email: String, password: String) async throws -> PublicProfile { throw SessionError.signedOut }
        func validAccessToken() async throws -> String { "a1" }
        func refreshNow() async throws {}
        func webSession() async throws -> WebSession { throw SessionError.signedOut }
        func signOut() async {}
        func discard() async {}
    }

    private static let now = Date(timeIntervalSince1970: 1_800_000_000)
    private static let categoriesJSON =
        #"{"data":[{"id":1,"name":"Costos fijos","parent_id":null,"palabras_clave":[],"is_archived":false,"estatico":true,"children":[{"id":10,"name":"Educación","parent_id":1,"palabras_clave":[],"is_archived":false,"estatico":false,"children":[{"id":100,"name":"Colegio","parent_id":10,"palabras_clave":["tuti"],"is_archived":false,"estatico":false,"children":null}]}]}],"meta":{}}"#

    private var file: URL = URL(fileURLWithPath: "/")

    override func setUpWithError() throws {
        let folder = FileManager.default.temporaryDirectory.appending(path: "coco-arbol-\(UUID().uuidString)")
        file = folder.appending(path: "arbol.json")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
    }

    private func synchronizer(_ transport: FakeTransport, now: Date = now) -> TreeSynchronizer {
        let base = URL(string: "https://api.coco.invalid") ?? URL(fileURLWithPath: "/")
        let api = APIClient(configuration: APIConfiguration(base: base), transport: transport, version: "0.1.0")
        return TreeSynchronizer(
            api: api, session: FixedSession(), store: DiskTreeStore(file: file), clock: { now })
    }

    private func save(downloadedAgo: TimeInterval) throws {
        let old = SavedTree(
            roots: [
                TreeNode(
                    id: 2, name: "Viejo", parentId: nil,
                    children: [TreeNode(id: 20, name: "Guardado", parentId: 2)])
            ],
            downloadedAt: Self.now.addingTimeInterval(-downloadedAgo)
        )
        try DiskTreeStore(file: file).save(old)
    }

    func testWithoutFileAndWithoutNetworkTheIndexIsNil() async {
        let transport = FakeTransport([.failure(URLError(.notConnectedToInternet))])
        let s = synchronizer(transport)
        await s.refreshIfNeeded()
        let index = await s.index()
        XCTAssertNil(index)
        XCTAssertEqual(transport.received.count, 1)
    }

    func testWithOldFileAndNetworkDownReturnsTheSaved() async throws {
        try save(downloadedAgo: 7200)
        let transport = FakeTransport([.failure(URLError(.timedOut))])
        let s = synchronizer(transport)
        await s.refreshIfNeeded()
        let index = await s.index()
        XCTAssertEqual(index?.search("guardado").map(\.id), [20])
        XCTAssertEqual(transport.received.count, 1, "lo intentó, falló, y se quedó con lo guardado")
    }

    func testWithTenMinuteOldFileDoesNotCallTheAPI() async throws {
        try save(downloadedAgo: 600)
        let transport = FakeTransport()
        let s = synchronizer(transport)
        await s.refreshIfNeeded()
        XCTAssertTrue(transport.received.isEmpty)
        let index = await s.index()
        XCTAssertEqual(index?.entries.map(\.id), [2, 20])
    }

    func testWithTwoHourOldFileCallsTheAPI() async throws {
        try save(downloadedAgo: 7200)
        let transport = FakeTransport([.http(200, Self.categoriesJSON)])
        let s = synchronizer(transport)
        await s.refreshIfNeeded()
        XCTAssertEqual(transport.received.first?.url?.path(), "/api/v1/categories")
        XCTAssertEqual(transport.received.first?.value(forHTTPHeaderField: "Authorization"), "Bearer a1")
        XCTAssertNil(transport.received.first?.url?.query(), "sin include_archived: la API ya excluye lo archivado")
        let index = await s.index()
        XCTAssertEqual(index?.search("tuti").map(\.id), [100])
    }

    func testAfterRefreshingTheFileIsRewrittenWithANewDate() async throws {
        try save(downloadedAgo: 7200)
        let transport = FakeTransport([.http(200, Self.categoriesJSON)])
        let s = synchronizer(transport)
        try await s.refreshNow()
        let loaded = try XCTUnwrap(DiskTreeStore(file: file).load())
        XCTAssertEqual(loaded.downloadedAt.timeIntervalSince1970, Self.now.timeIntervalSince1970, accuracy: 1)
        XCTAssertEqual(loaded.roots.map(\.id), [1])
        XCTAssertEqual(loaded.roots.first?.isStatic, true)
    }

    func testRefreshNowWithoutNetworkThrowsAndKeepsTheSaved() async throws {
        try save(downloadedAgo: 60)
        let transport = FakeTransport([.failure(URLError(.notConnectedToInternet))])
        let s = synchronizer(transport)
        do {
            try await s.refreshNow()
            XCTFail("tenía que fallar")
        } catch {
            XCTAssertEqual(error as? APIError, .noNetwork(.notConnectedToInternet))
        }
        let index = await s.index()
        XCTAssertEqual(index?.entries.map(\.id), [2, 20])
    }

    func testTheDiskStoreRoundTrips() throws {
        XCTAssertNil(try DiskTreeStore(file: file).load())
        try save(downloadedAgo: 0)
        let loaded = try XCTUnwrap(DiskTreeStore(file: file).load())
        XCTAssertEqual(loaded.roots.first?.children?.first?.name, "Guardado")
        XCTAssertEqual(loaded.downloadedAt.timeIntervalSince1970, Self.now.timeIntervalSince1970, accuracy: 1)
    }
}
