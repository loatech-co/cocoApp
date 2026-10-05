import XCTest

@testable import Coco

@MainActor
final class FormModelTests: XCTestCase {
    /// 2026-10-05 03:00 UTC: en Bogotá todavía es 4 de octubre.
    private nonisolated static let now = Date(timeIntervalSince1970: 1_791_169_200)

    private nonisolated static let tree = [
        TreeNode(
            id: 1, name: "Costos fijos", parentId: nil, isStatic: true,
            children: [
                TreeNode(
                    id: 10, name: "Educación", parentId: 1,
                    children: [
                        TreeNode(id: 100, name: "Colegio", parentId: 10, keywords: ["tuti"]),
                        TreeNode(id: 101, name: "Universidad", parentId: 10),
                    ])
            ]),
        TreeNode(
            id: 2, name: "Hogar", parentId: nil,
            children: [
                TreeNode(
                    id: 20, name: "Alimentación", parentId: 2,
                    children: [
                        TreeNode(id: 200, name: "Mercado", parentId: 20, keywords: ["d1", "exito"])
                    ])
            ]),
    ]

    private nonisolated static let interpretacionJSON =
        #"{"data":{"amount":"45000","date":"2026-10-03","merchant":"D1","description":null,"clasificacion":{"certeza":"alta","fuente":"regla","concepto_id":200,"categoria_id":20,"nombre":"Mercado","candidatos":[],"motivo":"palabra clave"},"por_revisar":false}}"#

    private var transport = FakeTransport()
    private var capturador = CapturerDouble()
    private var conectividad = Connectivity()
    private var lector = FakeReceiptReader(text: "D1\nTOTAL 45.000")

    override func setUp() {
        transport = FakeTransport()
        capturador = CapturerDouble()
        conectividad = Connectivity()
        lector = FakeReceiptReader(text: "D1\nTOTAL 45.000")
    }

    private func modelo(indice: TreeIndex? = TreeIndex(raices: tree)) throws -> FormModel {
        let base = try XCTUnwrap(URL(string: "https://api.coco.invalid"))
        let api = APIClient(configuration: APIConfiguration(base: base), transport: transport, version: "0.1.0")
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "formulario-\(UUID().uuidString)"))
        return FormModel(
            indice: indice, api: api, session: SessionDouble(), capturador: capturador, conectividad: conectividad,
            lector: lector, recientes: RecentsStore(defaults: defaults), reloj: { Self.now }
        )
    }

    private func entrada(_ id: Int) throws -> IndexEntry {
        try XCTUnwrap(TreeIndex(raices: Self.tree).entrada(id: id))
    }

    // MARK: cuerpo()

    func testElCuerpoNormalizaElMontoYPoneLaFechaEnBogota() throws {
        let m = try modelo()
        m.amount = "45.000"
        m.elegir(try entrada(200))
        m.note = "  del sábado  "
        let c = m.body()
        XCTAssertEqual(c.amount, "45000")
        XCTAssertEqual(c.categoryId, 200)
        XCTAssertEqual(c.date, "2026-10-04")
        XCTAssertEqual(c.period, "2026-10")
        XCTAssertEqual(c.note, "del sábado")
        XCTAssertNil(c.fileName)
        XCTAssertTrue(c.isSendable)
    }

    func testPuedeConfirmarExigeMontoYConceptoOTexto() throws {
        let m = try modelo()
        XCTAssertFalse(m.puedeConfirmar)
        m.amount = "45.000"
        XCTAssertFalse(m.puedeConfirmar)
        m.elegir(try entrada(100))
        XCTAssertTrue(m.puedeConfirmar)
        m.quitarConcepto()
        m.textoLeido = "TOTAL 45.000"
        XCTAssertTrue(m.puedeConfirmar)
        m.amount = "abc"
        XCTAssertFalse(m.puedeConfirmar)
    }

    // MARK: confirmar()

    func testConfirmarSinFotoEsManualYConFotoEsFoto() async throws {
        let m = try modelo()
        m.amount = "45.000"
        m.elegir(try entrada(100))
        _ = await m.confirmar()

        m.amount = "1.200"
        m.elegir(try entrada(100))
        m.fotoJPEG = Data([0xFF, 0xD8, 0x00])
        _ = await m.confirmar()

        XCTAssertEqual(capturador.recibidas.map(\.source), [.iosManual, .iosPhoto])
        XCTAssertEqual(capturador.recibidas.map(\.body.amount), ["45000", "1200"])
        XCTAssertEqual(capturador.recibidas.last?.body.fileName, "recibo-2026-10-04.jpg")
    }

    func testConfirmarDevuelveLoQueDigaElCapturadorYLimpia() async throws {
        let m = try modelo()
        capturador.response = .queued(pending: 3)
        m.amount = "45.000"
        m.elegir(try entrada(200))
        m.note = "x"
        m.cambiarFecha(Self.now.addingTimeInterval(-86_400))
        let r = await m.confirmar()
        XCTAssertEqual(r, .queued(pending: 3))
        XCTAssertEqual(m.amount, "")
        XCTAssertNil(m.concepto)
        XCTAssertEqual(m.note, "")
        XCTAssertEqual(m.date, Self.now)
        XCTAssertNil(m.fotoJPEG)
        XCTAssertNil(m.error)
    }

    func testConfirmarAnotaElConceptoEntreLosRecientes() async throws {
        let m = try modelo()
        m.search("")
        XCTAssertEqual(m.resultados, [])
        m.amount = "10.000"
        m.elegir(try entrada(100))
        _ = await m.confirmar()
        m.amount = "10.000"
        m.elegir(try entrada(200))
        _ = await m.confirmar()
        m.search("")
        XCTAssertEqual(m.resultados.map(\.id), [200, 100])
        m.search("d1")
        XCTAssertEqual(m.resultados.map(\.id), [200])
    }

    // MARK: leerFoto()

    func testLeerFotoRellenaLoVacioConLaInterpretacion() async throws {
        transport.responder(.http(200, Self.interpretacionJSON))
        let m = try modelo()
        await m.leerFoto(TestImage.cuadrada(10))

        XCTAssertEqual(lector.lecturas, 1)
        XCTAssertEqual(m.textoLeido, "D1\nTOTAL 45.000")
        XCTAssertEqual(m.amount, "45.000")
        XCTAssertEqual(m.merchant, "D1")
        XCTAssertEqual(BogotaDate.day(m.date), "2026-10-03")
        XCTAssertEqual(m.concepto?.id, 200)
        XCTAssertTrue(m.conceptoSugerido)
        XCTAssertNotNil(m.fotoJPEG)
        XCTAssertFalse(m.leyendo)
        XCTAssertFalse(m.noNetwork)
        XCTAssertEqual(transport.recibidas.map { $0.url?.path }, ["/api/v1/transactions/interpret"])
        XCTAssertTrue(m.puedeConfirmar)
    }

    func testLeerFotoNoPisaElMontoNiElConceptoYaPuestos() async throws {
        transport.responder(.http(200, Self.interpretacionJSON))
        let m = try modelo()
        m.amount = "12.500"
        m.elegir(try entrada(100))
        m.cambiarFecha(Self.now)
        await m.leerFoto(TestImage.cuadrada(10))
        XCTAssertEqual(m.amount, "12.500")
        XCTAssertEqual(m.concepto?.id, 100)
        XCTAssertFalse(m.conceptoSugerido)
        XCTAssertEqual(m.date, Self.now)
        XCTAssertEqual(m.merchant, "D1", "lo vacío sí se rellena")
    }

    func testSinRedNoLlamaAInterpretYLoMarca() async throws {
        let m = try modelo()
        conectividad.update(false)
        await m.leerFoto(TestImage.cuadrada(10))
        XCTAssertTrue(m.noNetwork)
        XCTAssertTrue(transport.recibidas.isEmpty)
        XCTAssertEqual(m.textoLeido, "D1\nTOTAL 45.000", "el OCR es local y el texto viaja igual")
        XCTAssertEqual(m.amount, "")
        XCTAssertNotNil(m.fotoJPEG)
    }

    func testUnErrorDeRedAlInterpretarTambienMarcaSinRed() async throws {
        transport.responder(.falla(URLError(.notConnectedToInternet)))
        let m = try modelo()
        await m.leerFoto(TestImage.cuadrada(10))
        XCTAssertTrue(m.noNetwork)
        XCTAssertNil(m.error)
    }

    func testSiElLectorFallaSeAvisaYLaFotoSeQueda() async throws {
        struct ReaderFailure: Error {}
        lector.error = ReaderFailure()
        let m = try modelo()
        await m.leerFoto(TestImage.cuadrada(10))
        XCTAssertNotNil(m.error)
        XCTAssertNotNil(m.fotoJPEG)
        XCTAssertNil(m.textoLeido)
        XCTAssertTrue(transport.recibidas.isEmpty)
    }

    func testConCertezaMediaAbreElBuscadorConLosCandidatos() async throws {
        let json =
            #"{"data":{"amount":"45000","date":"2026-10-03","merchant":"D1","description":null,"clasificacion":{"certeza":"media","fuente":null,"concepto_id":null,"categoria_id":null,"nombre":null,"candidatos":[{"id":200,"nombre":"Mercado","ruta":"Hogar › Alimentación › Mercado"},{"id":100,"nombre":"Colegio","ruta":"Costos fijos › Educación › Colegio"}],"motivo":""},"por_revisar":true}}"#
        transport.responder(.http(200, json))
        let m = try modelo()
        await m.leerFoto(TestImage.cuadrada(10))
        XCTAssertNil(m.concepto)
        XCTAssertEqual(m.candidates.map(\.id), [200, 100])
        XCTAssertTrue(m.abrirBuscador)
    }

    func testBuscarMuestraLaRutaYSinIndiceNoRevienta() throws {
        let m = try modelo()
        m.search("tuti")
        XCTAssertEqual(
            m.resultados.map(\.rutaLegible), ["Educación › Costos fijos"], "ancestros, del más cercano al más lejano")
        let sinIndice = try modelo(indice: nil)
        sinIndice.search("tuti")
        XCTAssertEqual(sinIndice.resultados, [])
    }
}
