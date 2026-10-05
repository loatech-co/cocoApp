import XCTest

@testable import Coco

final class QueuedCapturerTests: XCTestCase {
    private var raiz: URL = URL(fileURLWithPath: "/")
    private var enviador = SenderDouble()
    private var notificador = NotifierDouble()

    override func setUpWithError() throws {
        raiz = try TemporaryDirectory.directorio()
        enviador = SenderDouble()
        notificador = NotifierDouble()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: raiz)
    }

    private func capturador() -> QueuedCapturer {
        let cola = CaptureQueue(
            almacen: DiskQueueStore(raiz: raiz), enviador: enviador, sesion: SessionDouble(),
            notificador: notificador, separacion: .zero, encogerFoto: { $0 })
        return QueuedCapturer(cola: cola, notificador: notificador)
    }

    private let cuerpo = CaptureBody(comercio: "D1", monto: "45000")

    func testEnvioDentroDelPresupuestoDevuelveEnviadaYNotificaElResumen() async {
        let r = await capturador().capturar(cuerpo, origen: .wallet, foto: nil, presupuesto: .seconds(10))
        guard case .enviada(let g) = r else { return XCTFail("\(r)") }
        XCTAssertEqual(g.resumen, "Gasto de 45000 en D1")
        XCTAssertEqual(notificador.registradas.map(\.resumen), ["Gasto de 45000 en D1"])
        XCTAssertEqual(notificador.fallos, [])
    }

    func testSinRedQuedaEnColaSinNotificarResultado() async {
        enviador.responderCaptura(.falla(APIError.sinRed(.notConnectedToInternet)))
        let r = await capturador().capturar(cuerpo, origen: .sms, foto: nil, presupuesto: .seconds(10))
        XCTAssertEqual(r, .enCola(pendientes: 1))
        XCTAssertEqual(notificador.registradas, [])
        XCTAssertEqual(notificador.fallos, [])
        XCTAssertEqual(try DiskQueueStore(raiz: raiz).todas().count, 1)
    }

    func testUn422DevuelveFallidaYNotificaElFallo() async {
        enviador.responderCaptura(
            .falla(APIError.rechazada(status: 422, code: "VALIDATION", mensaje: "Falta el texto")))
        let r = await capturador().capturar(cuerpo, origen: .wallet, foto: nil, presupuesto: .seconds(10))
        XCTAssertEqual(r, .fallida(motivo: "Falta el texto"))
        XCTAssertEqual(notificador.fallos, ["Falta el texto"])
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
