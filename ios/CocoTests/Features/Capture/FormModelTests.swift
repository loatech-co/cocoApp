import XCTest

@testable import Coco

@MainActor
final class FormModelTests: XCTestCase {
    /// 2026-10-05 03:00 UTC: en Bogotá todavía es 4 de octubre.
    private nonisolated static let ahora = Date(timeIntervalSince1970: 1_791_169_200)

    private nonisolated static let arbol = [
        TreeNode(
            id: 1, name: "Costos fijos", parent_id: nil, estatico: true,
            children: [
                TreeNode(
                    id: 10, name: "Educación", parent_id: 1,
                    children: [
                        TreeNode(id: 100, name: "Colegio", parent_id: 10, palabras_clave: ["tuti"]),
                        TreeNode(id: 101, name: "Universidad", parent_id: 10),
                    ])
            ]),
        TreeNode(
            id: 2, name: "Hogar", parent_id: nil,
            children: [
                TreeNode(
                    id: 20, name: "Alimentación", parent_id: 2,
                    children: [
                        TreeNode(id: 200, name: "Mercado", parent_id: 20, palabras_clave: ["d1", "exito"])
                    ])
            ]),
    ]

    private nonisolated static let interpretacionJSON =
        #"{"data":{"amount":"45000","date":"2026-10-03","merchant":"D1","description":null,"clasificacion":{"certeza":"alta","fuente":"regla","concepto_id":200,"categoria_id":20,"nombre":"Mercado","candidatos":[],"motivo":"palabra clave"},"por_revisar":false}}"#

    private var transporte = FakeTransport()
    private var capturador = CapturerDouble()
    private var conectividad = Connectivity()
    private var lector = FakeReceiptReader(texto: "D1\nTOTAL 45.000")

    override func setUp() {
        transporte = FakeTransport()
        capturador = CapturerDouble()
        conectividad = Connectivity()
        lector = FakeReceiptReader(texto: "D1\nTOTAL 45.000")
    }

    private func modelo(indice: TreeIndex? = TreeIndex(raices: arbol)) throws -> FormModel {
        let base = try XCTUnwrap(URL(string: "https://api.coco.invalid"))
        let api = APIClient(configuracion: APIConfiguration(base: base), transporte: transporte, version: "0.1.0")
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "formulario-\(UUID().uuidString)"))
        return FormModel(
            indice: indice, api: api, sesion: SessionDouble(), capturador: capturador, conectividad: conectividad,
            lector: lector, recientes: RecentsStore(defaults: defaults), reloj: { Self.ahora }
        )
    }

    private func entrada(_ id: Int) throws -> IndexEntry {
        try XCTUnwrap(TreeIndex(raices: Self.arbol).entrada(id: id))
    }

    // MARK: cuerpo()

    func testElCuerpoNormalizaElMontoYPoneLaFechaEnBogota() throws {
        let m = try modelo()
        m.monto = "45.000"
        m.elegir(try entrada(200))
        m.nota = "  del sábado  "
        let c = m.cuerpo()
        XCTAssertEqual(c.monto, "45000")
        XCTAssertEqual(c.category_id, 200)
        XCTAssertEqual(c.fecha, "2026-10-04")
        XCTAssertEqual(c.periodo, "2026-10")
        XCTAssertEqual(c.nota, "del sábado")
        XCTAssertNil(c.nombre_de_archivo)
        XCTAssertTrue(c.esEnviable)
    }

    func testPuedeConfirmarExigeMontoYConceptoOTexto() throws {
        let m = try modelo()
        XCTAssertFalse(m.puedeConfirmar)
        m.monto = "45.000"
        XCTAssertFalse(m.puedeConfirmar)
        m.elegir(try entrada(100))
        XCTAssertTrue(m.puedeConfirmar)
        m.quitarConcepto()
        m.textoLeido = "TOTAL 45.000"
        XCTAssertTrue(m.puedeConfirmar)
        m.monto = "abc"
        XCTAssertFalse(m.puedeConfirmar)
    }

    // MARK: confirmar()

    func testConfirmarSinFotoEsManualYConFotoEsFoto() async throws {
        let m = try modelo()
        m.monto = "45.000"
        m.elegir(try entrada(100))
        _ = await m.confirmar()

        m.monto = "1.200"
        m.elegir(try entrada(100))
        m.fotoJPEG = Data([0xFF, 0xD8, 0x00])
        _ = await m.confirmar()

        XCTAssertEqual(capturador.recibidas.map(\.origen), [.iosManual, .iosFoto])
        XCTAssertEqual(capturador.recibidas.map(\.cuerpo.monto), ["45000", "1200"])
        XCTAssertEqual(capturador.recibidas.last?.cuerpo.nombre_de_archivo, "recibo-2026-10-04.jpg")
    }

    func testConfirmarDevuelveLoQueDigaElCapturadorYLimpia() async throws {
        let m = try modelo()
        capturador.respuesta = .enCola(pendientes: 3)
        m.monto = "45.000"
        m.elegir(try entrada(200))
        m.nota = "x"
        m.cambiarFecha(Self.ahora.addingTimeInterval(-86_400))
        let r = await m.confirmar()
        XCTAssertEqual(r, .enCola(pendientes: 3))
        XCTAssertEqual(m.monto, "")
        XCTAssertNil(m.concepto)
        XCTAssertEqual(m.nota, "")
        XCTAssertEqual(m.fecha, Self.ahora)
        XCTAssertNil(m.fotoJPEG)
        XCTAssertNil(m.error)
    }

    func testConfirmarAnotaElConceptoEntreLosRecientes() async throws {
        let m = try modelo()
        m.buscar("")
        XCTAssertEqual(m.resultados, [])
        m.monto = "10.000"
        m.elegir(try entrada(100))
        _ = await m.confirmar()
        m.monto = "10.000"
        m.elegir(try entrada(200))
        _ = await m.confirmar()
        m.buscar("")
        XCTAssertEqual(m.resultados.map(\.id), [200, 100])
        m.buscar("d1")
        XCTAssertEqual(m.resultados.map(\.id), [200])
    }

    // MARK: leerFoto()

    func testLeerFotoRellenaLoVacioConLaInterpretacion() async throws {
        transporte.responder(.http(200, Self.interpretacionJSON))
        let m = try modelo()
        await m.leerFoto(TestImage.cuadrada(10))

        XCTAssertEqual(lector.lecturas, 1)
        XCTAssertEqual(m.textoLeido, "D1\nTOTAL 45.000")
        XCTAssertEqual(m.monto, "45.000")
        XCTAssertEqual(m.comercio, "D1")
        XCTAssertEqual(BogotaDate.dia(m.fecha), "2026-10-03")
        XCTAssertEqual(m.concepto?.id, 200)
        XCTAssertTrue(m.conceptoSugerido)
        XCTAssertNotNil(m.fotoJPEG)
        XCTAssertFalse(m.leyendo)
        XCTAssertFalse(m.sinRed)
        XCTAssertEqual(transporte.recibidas.map { $0.url?.path }, ["/api/v1/transactions/interpret"])
        XCTAssertTrue(m.puedeConfirmar)
    }

    func testLeerFotoNoPisaElMontoNiElConceptoYaPuestos() async throws {
        transporte.responder(.http(200, Self.interpretacionJSON))
        let m = try modelo()
        m.monto = "12.500"
        m.elegir(try entrada(100))
        m.cambiarFecha(Self.ahora)
        await m.leerFoto(TestImage.cuadrada(10))
        XCTAssertEqual(m.monto, "12.500")
        XCTAssertEqual(m.concepto?.id, 100)
        XCTAssertFalse(m.conceptoSugerido)
        XCTAssertEqual(m.fecha, Self.ahora)
        XCTAssertEqual(m.comercio, "D1", "lo vacío sí se rellena")
    }

    func testSinRedNoLlamaAInterpretYLoMarca() async throws {
        let m = try modelo()
        conectividad.actualizar(false)
        await m.leerFoto(TestImage.cuadrada(10))
        XCTAssertTrue(m.sinRed)
        XCTAssertTrue(transporte.recibidas.isEmpty)
        XCTAssertEqual(m.textoLeido, "D1\nTOTAL 45.000", "el OCR es local y el texto viaja igual")
        XCTAssertEqual(m.monto, "")
        XCTAssertNotNil(m.fotoJPEG)
    }

    func testUnErrorDeRedAlInterpretarTambienMarcaSinRed() async throws {
        transporte.responder(.falla(URLError(.notConnectedToInternet)))
        let m = try modelo()
        await m.leerFoto(TestImage.cuadrada(10))
        XCTAssertTrue(m.sinRed)
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
        XCTAssertTrue(transporte.recibidas.isEmpty)
    }

    func testConCertezaMediaAbreElBuscadorConLosCandidatos() async throws {
        let json =
            #"{"data":{"amount":"45000","date":"2026-10-03","merchant":"D1","description":null,"clasificacion":{"certeza":"media","fuente":null,"concepto_id":null,"categoria_id":null,"nombre":null,"candidatos":[{"id":200,"nombre":"Mercado","ruta":"Hogar › Alimentación › Mercado"},{"id":100,"nombre":"Colegio","ruta":"Costos fijos › Educación › Colegio"}],"motivo":""},"por_revisar":true}}"#
        transporte.responder(.http(200, json))
        let m = try modelo()
        await m.leerFoto(TestImage.cuadrada(10))
        XCTAssertNil(m.concepto)
        XCTAssertEqual(m.candidatos.map(\.id), [200, 100])
        XCTAssertTrue(m.abrirBuscador)
    }

    func testBuscarMuestraLaRutaYSinIndiceNoRevienta() throws {
        let m = try modelo()
        m.buscar("tuti")
        XCTAssertEqual(
            m.resultados.map(\.rutaLegible), ["Educación › Costos fijos"], "ancestros, del más cercano al más lejano")
        let sinIndice = try modelo(indice: nil)
        sinIndice.buscar("tuti")
        XCTAssertEqual(sinIndice.resultados, [])
    }
}
