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
    private static let categoriasJSON =
        #"{"data":[{"id":1,"name":"Costos fijos","parent_id":null,"palabras_clave":[],"is_archived":false,"estatico":true,"children":[{"id":10,"name":"Educación","parent_id":1,"palabras_clave":[],"is_archived":false,"estatico":false,"children":[{"id":100,"name":"Colegio","parent_id":10,"palabras_clave":["tuti"],"is_archived":false,"estatico":false,"children":null}]}]}],"meta":{}}"#

    private var file: URL = URL(fileURLWithPath: "/")

    override func setUpWithError() throws {
        let folder = FileManager.default.temporaryDirectory.appending(path: "coco-arbol-\(UUID().uuidString)")
        file = folder.appending(path: "arbol.json")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
    }

    private func sincronizador(_ transport: FakeTransport, now: Date = now) -> TreeSynchronizer {
        let base = URL(string: "https://api.coco.invalid") ?? URL(fileURLWithPath: "/")
        let api = APIClient(configuration: APIConfiguration(base: base), transport: transport, version: "0.1.0")
        return TreeSynchronizer(
            api: api, session: FixedSession(), almacen: DiskTreeStore(file: file), reloj: { now })
    }

    private func save(descargadoHace: TimeInterval) throws {
        let viejo = SavedTree(
            raices: [
                TreeNode(
                    id: 2, name: "Viejo", parentId: nil,
                    children: [TreeNode(id: 20, name: "Guardado", parentId: 2)])
            ],
            descargadoEn: Self.now.addingTimeInterval(-descargadoHace)
        )
        try DiskTreeStore(file: file).save(viejo)
    }

    func testSinArchivoYSinRedElIndiceEsNil() async {
        let transport = FakeTransport([.falla(URLError(.notConnectedToInternet))])
        let s = sincronizador(transport)
        await s.refreshIfNeeded()
        let indice = await s.indice()
        XCTAssertNil(indice)
        XCTAssertEqual(transport.recibidas.count, 1)
    }

    func testConArchivoViejoYRedCaidaDevuelveLoGuardado() async throws {
        try save(descargadoHace: 7200)
        let transport = FakeTransport([.falla(URLError(.timedOut))])
        let s = sincronizador(transport)
        await s.refreshIfNeeded()
        let indice = await s.indice()
        XCTAssertEqual(indice?.search("guardado").map(\.id), [20])
        XCTAssertEqual(transport.recibidas.count, 1, "lo intentó, falló, y se quedó con lo guardado")
    }

    func testConArchivoDeHaceDiezMinutosNoLlamaALaAPI() async throws {
        try save(descargadoHace: 600)
        let transport = FakeTransport()
        let s = sincronizador(transport)
        await s.refreshIfNeeded()
        XCTAssertTrue(transport.recibidas.isEmpty)
        let indice = await s.indice()
        XCTAssertEqual(indice?.entradas.map(\.id), [2, 20])
    }

    func testConArchivoDeHaceDosHorasSiLlama() async throws {
        try save(descargadoHace: 7200)
        let transport = FakeTransport([.http(200, Self.categoriasJSON)])
        let s = sincronizador(transport)
        await s.refreshIfNeeded()
        XCTAssertEqual(transport.recibidas.first?.url?.path(), "/api/v1/categories")
        XCTAssertEqual(transport.recibidas.first?.value(forHTTPHeaderField: "Authorization"), "Bearer a1")
        XCTAssertNil(transport.recibidas.first?.url?.query(), "sin include_archived: la API ya excluye lo archivado")
        let indice = await s.indice()
        XCTAssertEqual(indice?.search("tuti").map(\.id), [100])
    }

    func testTrasRefrescarElArchivoSeReescribeConFechaNueva() async throws {
        try save(descargadoHace: 7200)
        let transport = FakeTransport([.http(200, Self.categoriasJSON)])
        let s = sincronizador(transport)
        try await s.refrescarAhora()
        let leido = try XCTUnwrap(DiskTreeStore(file: file).load())
        XCTAssertEqual(leido.descargadoEn.timeIntervalSince1970, Self.now.timeIntervalSince1970, accuracy: 1)
        XCTAssertEqual(leido.raices.map(\.id), [1])
        XCTAssertEqual(leido.raices.first?.isStatic, true)
    }

    func testRefrescarAhoraSinRedLanzaYConservaLoGuardado() async throws {
        try save(descargadoHace: 60)
        let transport = FakeTransport([.falla(URLError(.notConnectedToInternet))])
        let s = sincronizador(transport)
        do {
            try await s.refrescarAhora()
            XCTFail("tenía que fallar")
        } catch {
            XCTAssertEqual(error as? APIError, .noNetwork(.notConnectedToInternet))
        }
        let indice = await s.indice()
        XCTAssertEqual(indice?.entradas.map(\.id), [2, 20])
    }

    func testElAlmacenEnDiscoVaYVuelve() throws {
        XCTAssertNil(try DiskTreeStore(file: file).load())
        try save(descargadoHace: 0)
        let leido = try XCTUnwrap(DiskTreeStore(file: file).load())
        XCTAssertEqual(leido.raices.first?.children?.first?.name, "Guardado")
        XCTAssertEqual(leido.descargadoEn.timeIntervalSince1970, Self.now.timeIntervalSince1970, accuracy: 1)
    }
}
