import XCTest

@testable import Coco

final class QueuedCapturerTests: XCTestCase {
    private var root: URL = URL(fileURLWithPath: "/")
    private var enviador = SenderDouble()
    private var notifier = NotifierDouble()

    override func setUpWithError() throws {
        root = try TemporaryDirectory.directorio()
        enviador = SenderDouble()
        notifier = NotifierDouble()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func capturador() -> QueuedCapturer {
        let queue = CaptureQueue(
            almacen: DiskQueueStore(root: root), enviador: enviador, session: SessionDouble(),
            notifier: notifier, separacion: .zero, encogerFoto: { $0 })
        return QueuedCapturer(queue: queue, notifier: notifier)
    }

    private let body = CaptureBody(merchant: "D1", amount: "45000")

    func testEnvioDentroDelPresupuestoDevuelveEnviadaYNotificaElResumen() async {
        let r = await capturador().capture(body, source: .wallet, photo: nil, budget: .seconds(10))
        guard case .sent(let g) = r else { return XCTFail("\(r)") }
        XCTAssertEqual(g.summary, "Gasto de 45000 en D1")
        XCTAssertEqual(notifier.isRegistered.map(\.summary), ["Gasto de 45000 en D1"])
        XCTAssertEqual(notifier.fallos, [])
    }

    func testSinRedQuedaEnColaSinNotificarResultado() async {
        enviador.responderCaptura(.falla(APIError.noNetwork(.notConnectedToInternet)))
        let r = await capturador().capture(body, source: .sms, photo: nil, budget: .seconds(10))
        XCTAssertEqual(r, .queued(pending: 1))
        XCTAssertEqual(notifier.isRegistered, [])
        XCTAssertEqual(notifier.fallos, [])
        XCTAssertEqual(try DiskQueueStore(root: root).all().count, 1)
    }

    func testUn422DevuelveFallidaYNotificaElFallo() async {
        enviador.responderCaptura(
            .falla(APIError.rejected(status: 422, code: "VALIDATION", message: "Falta el texto")))
        let r = await capturador().capture(body, source: .wallet, photo: nil, budget: .seconds(10))
        XCTAssertEqual(r, .failed(reason: "Falta el texto"))
        XCTAssertEqual(notifier.fallos, ["Falta el texto"])
    }

    func testElReductorDejaLaFotoEnMenosDe1600px() throws {
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1
        let grande = UIGraphicsImageRenderer(size: CGSize(width: 3200, height: 2000), format: formato).image { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 3200, height: 2000))
        }
        let png = try XCTUnwrap(grande.pngData())
        let jpeg = PhotoReducer.jpeg(png)
        let reducida = try XCTUnwrap(UIImage(data: jpeg))
        XCTAssertEqual(reducida.size.width * reducida.scale, 1600)
        XCTAssertEqual(reducida.size.height * reducida.scale, 1000)
        XCTAssertLessThan(jpeg.count, png.count)
        // Lo que no es imagen pasa tal cual.
        XCTAssertEqual(PhotoReducer.jpeg(Data([1, 2, 3])), Data([1, 2, 3]))
    }
}
