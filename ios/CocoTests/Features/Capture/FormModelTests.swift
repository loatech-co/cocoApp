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

    private nonisolated static let interpretationJSON =
        #"{"data":{"amount":"45000","date":"2026-10-03","merchant":"D1","description":null,"clasificacion":{"certeza":"alta","fuente":"regla","concepto_id":200,"categoria_id":20,"nombre":"Mercado","candidatos":[],"motivo":"palabra clave"},"por_revisar":false}}"#

    private var transport = FakeTransport()
    private var capturer = CapturerDouble()
    private var connectivity = Connectivity()
    private var reader = FakeReceiptReader(text: "D1\nTOTAL 45.000")

    override func setUp() {
        transport = FakeTransport()
        capturer = CapturerDouble()
        connectivity = Connectivity()
        reader = FakeReceiptReader(text: "D1\nTOTAL 45.000")
    }

    private func model(index: TreeIndex? = TreeIndex(roots: tree)) throws -> FormModel {
        let base = try XCTUnwrap(URL(string: "https://api.coco.invalid"))
        let api = APIClient(configuration: APIConfiguration(base: base), transport: transport, version: "0.1.0")
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "formulario-\(UUID().uuidString)"))
        return FormModel(
            index: index, api: api, session: SessionDouble(), capturer: capturer, connectivity: connectivity,
            reader: reader, recents: RecentsStore(defaults: defaults), clock: { Self.now }
        )
    }

    private func entry(_ id: Int) throws -> IndexEntry {
        try XCTUnwrap(TreeIndex(roots: Self.tree).entry(id: id))
    }

    // MARK: cuerpo()

    func testTheBodyNormalizesTheAmountAndPutsTheDateInBogota() throws {
        let m = try model()
        m.amount = "45.000"
        m.choose(try entry(200))
        m.note = "  del sábado  "
        let c = m.captureBody()
        XCTAssertEqual(c.amount, "45000")
        XCTAssertEqual(c.categoryId, 200)
        XCTAssertEqual(c.date, "2026-10-04")
        XCTAssertEqual(c.period, "2026-10")
        XCTAssertEqual(c.note, "del sábado")
        XCTAssertNil(c.fileName)
        XCTAssertTrue(c.isSendable)
    }

    func testCanConfirmRequiresAmountAndConceptOrText() throws {
        let m = try model()
        XCTAssertFalse(m.canConfirm)
        m.amount = "45.000"
        XCTAssertFalse(m.canConfirm)
        m.choose(try entry(100))
        XCTAssertTrue(m.canConfirm)
        m.clearConcept()
        m.readText = "TOTAL 45.000"
        XCTAssertTrue(m.canConfirm)
        m.amount = "abc"
        XCTAssertFalse(m.canConfirm)
    }

    // MARK: confirmar()

    func testConfirmWithoutPhotoIsManualAndWithPhotoIsPhoto() async throws {
        let m = try model()
        m.amount = "45.000"
        m.choose(try entry(100))
        _ = await m.confirm()

        m.amount = "1.200"
        m.choose(try entry(100))
        m.photoJPEG = Data([0xFF, 0xD8, 0x00])
        _ = await m.confirm()

        XCTAssertEqual(capturer.received.map(\.source), [.iosManual, .iosPhoto])
        XCTAssertEqual(capturer.received.map(\.body.amount), ["45000", "1200"])
        XCTAssertEqual(capturer.received.last?.body.fileName, "recibo-2026-10-04.jpg")
    }

    func testConfirmReturnsWhatTheCapturerSaysAndResets() async throws {
        let m = try model()
        capturer.response = .queued(pending: 3)
        m.amount = "45.000"
        m.choose(try entry(200))
        m.note = "x"
        m.changeDate(Self.now.addingTimeInterval(-86_400))
        let r = await m.confirm()
        XCTAssertEqual(r, .queued(pending: 3))
        XCTAssertEqual(m.amount, "")
        XCTAssertNil(m.concept)
        XCTAssertEqual(m.note, "")
        XCTAssertEqual(m.date, Self.now)
        XCTAssertNil(m.photoJPEG)
        XCTAssertNil(m.error)
    }

    func testConfirmRecordsTheConceptAmongRecents() async throws {
        let m = try model()
        m.search("")
        XCTAssertEqual(m.results, [])
        m.amount = "10.000"
        m.choose(try entry(100))
        _ = await m.confirm()
        m.amount = "10.000"
        m.choose(try entry(200))
        _ = await m.confirm()
        m.search("")
        XCTAssertEqual(m.results.map(\.id), [200, 100])
        m.search("d1")
        XCTAssertEqual(m.results.map(\.id), [200])
    }

    // MARK: leerFoto()

    func testReadPhotoFillsTheBlanksWithTheInterpretation() async throws {
        transport.responder(.http(200, Self.interpretationJSON))
        let m = try model()
        await m.readPhoto(TestImage.square(10))

        XCTAssertEqual(reader.reads, 1)
        XCTAssertEqual(m.readText, "D1\nTOTAL 45.000")
        XCTAssertEqual(m.amount, "45.000")
        XCTAssertEqual(m.merchant, "D1")
        XCTAssertEqual(BogotaDate.day(m.date), "2026-10-03")
        XCTAssertEqual(m.concept?.id, 200)
        XCTAssertTrue(m.isConceptSuggested)
        XCTAssertNotNil(m.photoJPEG)
        XCTAssertFalse(m.isReading)
        XCTAssertFalse(m.noNetwork)
        XCTAssertEqual(transport.received.map { $0.url?.path }, ["/api/v1/transactions/interpret"])
        XCTAssertTrue(m.canConfirm)
    }

    func testReadPhotoDoesNotOverwriteAmountOrConceptAlreadySet() async throws {
        transport.responder(.http(200, Self.interpretationJSON))
        let m = try model()
        m.amount = "12.500"
        m.choose(try entry(100))
        m.changeDate(Self.now)
        await m.readPhoto(TestImage.square(10))
        XCTAssertEqual(m.amount, "12.500")
        XCTAssertEqual(m.concept?.id, 100)
        XCTAssertFalse(m.isConceptSuggested)
        XCTAssertEqual(m.date, Self.now)
        XCTAssertEqual(m.merchant, "D1", "lo vacío sí se rellena")
    }

    func testWithoutNetworkDoesNotCallInterpretAndFlagsIt() async throws {
        let m = try model()
        connectivity.update(false)
        await m.readPhoto(TestImage.square(10))
        XCTAssertTrue(m.noNetwork)
        XCTAssertTrue(transport.received.isEmpty)
        XCTAssertEqual(m.readText, "D1\nTOTAL 45.000", "el OCR es local y el texto viaja igual")
        XCTAssertEqual(m.amount, "")
        XCTAssertNotNil(m.photoJPEG)
    }

    func testANetworkErrorWhileInterpretingAlsoFlagsNoNetwork() async throws {
        transport.responder(.failure(URLError(.notConnectedToInternet)))
        let m = try model()
        await m.readPhoto(TestImage.square(10))
        XCTAssertTrue(m.noNetwork)
        XCTAssertNil(m.error)
    }

    func testIfTheReaderFailsItWarnsAndThePhotoStays() async throws {
        struct ReaderFailure: Error {}
        reader.error = ReaderFailure()
        let m = try model()
        await m.readPhoto(TestImage.square(10))
        XCTAssertNotNil(m.error)
        XCTAssertNotNil(m.photoJPEG)
        XCTAssertNil(m.readText)
        XCTAssertTrue(transport.received.isEmpty)
    }

    func testMediumConfidenceOpensSearchWithTheCandidates() async throws {
        let json =
            #"{"data":{"amount":"45000","date":"2026-10-03","merchant":"D1","description":null,"clasificacion":{"certeza":"media","fuente":null,"concepto_id":null,"categoria_id":null,"nombre":null,"candidatos":[{"id":200,"nombre":"Mercado","ruta":"Hogar › Alimentación › Mercado"},{"id":100,"nombre":"Colegio","ruta":"Costos fijos › Educación › Colegio"}],"motivo":""},"por_revisar":true}}"#
        transport.responder(.http(200, json))
        let m = try model()
        await m.readPhoto(TestImage.square(10))
        XCTAssertNil(m.concept)
        XCTAssertEqual(m.candidates.map(\.id), [200, 100])
        XCTAssertTrue(m.showsSearch)
    }

    func testSearchShowsThePathAndWithoutIndexDoesNotCrash() throws {
        let m = try model()
        m.search("tuti")
        XCTAssertEqual(
            m.results.map(\.rutaLegible), ["Educación › Costos fijos"], "ancestros, del más cercano al más lejano")
        let withoutIndex = try model(index: nil)
        withoutIndex.search("tuti")
        XCTAssertEqual(withoutIndex.results, [])
    }
}
