import XCTest

@testable import Coco

final class TreeSynchronizerTests: XCTestCase {
    /// Una sesión que siempre tiene token: aquí se prueba el árbol, no la sesión.
    private final class FixedSession: Session, @unchecked Sendable {
        var estado: SessionState { .sinSesion }
        let cambios: AsyncStream<SessionState> = AsyncStream { $0.finish() }
        func restaurar() async {}
        func entrar(correo: String, contrasena: String) async throws -> PublicProfile { throw SessionError.sinSesion }
        func accessTokenVigente() async throws -> String { "a1" }
        func renovarAhora() async throws {}
        func sesionParaLaWeb() async throws -> WebSession { throw SessionError.sinSesion }
        func salir() async {}
        func descartar() async {}
    }

    private static let ahora = Date(timeIntervalSince1970: 1_800_000_000)
    private static let categoriasJSON =
        #"{"data":[{"id":1,"name":"Costos fijos","parent_id":null,"palabras_clave":[],"is_archived":false,"estatico":true,"children":[{"id":10,"name":"Educación","parent_id":1,"palabras_clave":[],"is_archived":false,"estatico":false,"children":[{"id":100,"name":"Colegio","parent_id":10,"palabras_clave":["tuti"],"is_archived":false,"estatico":false,"children":null}]}]}],"meta":{}}"#

    private var archivo: URL = URL(fileURLWithPath: "/")

    override func setUpWithError() throws {
        let carpeta = FileManager.default.temporaryDirectory.appending(path: "coco-arbol-\(UUID().uuidString)")
        archivo = carpeta.appending(path: "arbol.json")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: archivo.deletingLastPathComponent())
    }

    private func sincronizador(_ transporte: FakeTransport, ahora: Date = ahora) -> TreeSynchronizer {
        let base = URL(string: "https://api.coco.invalid") ?? URL(fileURLWithPath: "/")
        let api = APIClient(configuracion: APIConfiguration(base: base), transporte: transporte, version: "0.1.0")
        return TreeSynchronizer(
            api: api, sesion: FixedSession(), almacen: DiskTreeStore(archivo: archivo), reloj: { ahora })
    }

    private func guardar(descargadoHace: TimeInterval) throws {
        let viejo = SavedTree(
            raices: [
                TreeNode(
                    id: 2, name: "Viejo", parent_id: nil,
                    children: [TreeNode(id: 20, name: "Guardado", parent_id: 2)])
            ],
            descargadoEn: Self.ahora.addingTimeInterval(-descargadoHace)
        )
        try DiskTreeStore(archivo: archivo).guardar(viejo)
    }

    func testSinArchivoYSinRedElIndiceEsNil() async {
        let transporte = FakeTransport([.falla(URLError(.notConnectedToInternet))])
        let s = sincronizador(transporte)
        await s.refrescarSiHaceFalta()
        let indice = await s.indice()
        XCTAssertNil(indice)
        XCTAssertEqual(transporte.recibidas.count, 1)
    }

    func testConArchivoViejoYRedCaidaDevuelveLoGuardado() async throws {
        try guardar(descargadoHace: 7200)
        let transporte = FakeTransport([.falla(URLError(.timedOut))])
        let s = sincronizador(transporte)
        await s.refrescarSiHaceFalta()
        let indice = await s.indice()
        XCTAssertEqual(indice?.buscar("guardado").map(\.id), [20])
        XCTAssertEqual(transporte.recibidas.count, 1, "lo intentó, falló, y se quedó con lo guardado")
    }

    func testConArchivoDeHaceDiezMinutosNoLlamaALaAPI() async throws {
        try guardar(descargadoHace: 600)
        let transporte = FakeTransport()
        let s = sincronizador(transporte)
        await s.refrescarSiHaceFalta()
        XCTAssertTrue(transporte.recibidas.isEmpty)
        let indice = await s.indice()
        XCTAssertEqual(indice?.entradas.map(\.id), [2, 20])
    }

    func testConArchivoDeHaceDosHorasSiLlama() async throws {
        try guardar(descargadoHace: 7200)
        let transporte = FakeTransport([.http(200, Self.categoriasJSON)])
        let s = sincronizador(transporte)
        await s.refrescarSiHaceFalta()
        XCTAssertEqual(transporte.recibidas.first?.url?.path(), "/api/v1/categories")
        XCTAssertEqual(transporte.recibidas.first?.value(forHTTPHeaderField: "Authorization"), "Bearer a1")
        XCTAssertNil(transporte.recibidas.first?.url?.query(), "sin include_archived: la API ya excluye lo archivado")
        let indice = await s.indice()
        XCTAssertEqual(indice?.buscar("tuti").map(\.id), [100])
    }

    func testTrasRefrescarElArchivoSeReescribeConFechaNueva() async throws {
        try guardar(descargadoHace: 7200)
        let transporte = FakeTransport([.http(200, Self.categoriasJSON)])
        let s = sincronizador(transporte)
        try await s.refrescarAhora()
        let leido = try XCTUnwrap(DiskTreeStore(archivo: archivo).cargar())
        XCTAssertEqual(leido.descargadoEn.timeIntervalSince1970, Self.ahora.timeIntervalSince1970, accuracy: 1)
        XCTAssertEqual(leido.raices.map(\.id), [1])
        XCTAssertEqual(leido.raices.first?.estatico, true)
    }

    func testRefrescarAhoraSinRedLanzaYConservaLoGuardado() async throws {
        try guardar(descargadoHace: 60)
        let transporte = FakeTransport([.falla(URLError(.notConnectedToInternet))])
        let s = sincronizador(transporte)
        do {
            try await s.refrescarAhora()
            XCTFail("tenía que fallar")
        } catch {
            XCTAssertEqual(error as? APIError, .sinRed(.notConnectedToInternet))
        }
        let indice = await s.indice()
        XCTAssertEqual(indice?.entradas.map(\.id), [2, 20])
    }

    func testElAlmacenEnDiscoVaYVuelve() throws {
        XCTAssertNil(try DiskTreeStore(archivo: archivo).cargar())
        try guardar(descargadoHace: 0)
        let leido = try XCTUnwrap(DiskTreeStore(archivo: archivo).cargar())
        XCTAssertEqual(leido.raices.first?.children?.first?.name, "Guardado")
        XCTAssertEqual(leido.descargadoEn.timeIntervalSince1970, Self.ahora.timeIntervalSince1970, accuracy: 1)
    }
}
