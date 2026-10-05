import XCTest

@testable import Coco

@MainActor
final class RouterTests: XCTestCase {
    private func url(_ s: String) throws -> URL { try XCTUnwrap(URL(string: s)) }

    func testDestinoDeLasURLsDeLaApp() throws {
        XCTAssertEqual(Router.destination(from: try url("coco://capturar/manual")), .quickForm(withCamera: false))
        XCTAssertEqual(Router.destination(from: try url("coco://capturar")), .quickForm(withCamera: false))
        XCTAssertEqual(Router.destination(from: try url("coco://capturar/foto")), .quickForm(withCamera: true))
        XCTAssertEqual(Router.destination(from: try url("COCO://Capturar/FOTO")), .quickForm(withCamera: true))
        XCTAssertEqual(Router.destination(from: try url("coco://capturas")), .captures)
        XCTAssertEqual(
            Router.destination(from: try url(SystemNotifier.captureDestination)), .captures,
            "el aviso de una captura lleva a la lista")
    }

    func testURLsDesconocidasNoSonDestino() throws {
        XCTAssertNil(Router.destination(from: try url("coco://otra")))
        XCTAssertNil(Router.destination(from: try url("coco://capturar/video")))
        XCTAssertNil(Router.destination(from: try url("coco://capturas/1")))
        XCTAssertNil(Router.destination(from: try url("https://dev-cocoapp.viteri.me/capturar/manual")))
        let e = Router()
        XCTAssertFalse(e.abrir(url: try url("coco://otra")))
        XCTAssertEqual(e.pestana, .inicio)
    }

    func testAbrirCambiaLaPestanaYRenuevaElFormulario() throws {
        let e = Router()
        let before = e.formulario.generacion
        XCTAssertTrue(e.abrir(url: try url("coco://capturar/foto")))
        XCTAssertEqual(e.pestana, .register)
        XCTAssertTrue(e.formulario.withCamera)
        XCTAssertEqual(e.formulario.generacion, before + 1)

        XCTAssertTrue(e.abrir(url: try url("coco://capturar/manual")))
        XCTAssertFalse(e.formulario.withCamera)
        XCTAssertEqual(e.formulario.generacion, before + 2, "cada petición es un formulario nuevo")

        XCTAssertTrue(e.abrir(url: try url("coco://capturas")))
        XCTAssertEqual(e.pestana, .captures)
    }

    func testIrAWebDejaLaRutaPendienteEnInicio() {
        let e = Router()
        e.pestana = .mas
        e.go(.web(path: "/centros-de-costos"))
        XCTAssertEqual(e.pestana, .inicio)
        XCTAssertEqual(e.rutaWebPendiente, "/centros-de-costos")
    }

    func testBuscarVaAInicioConLaBusquedaPendiente() {
        let e = Router()
        e.pestana = .captures
        e.go(.search)
        XCTAssertEqual(e.pestana, .inicio)
        XCTAssertTrue(e.busquedaPendiente)
    }

    func testLasHojasNoCambianDePestanaYUnDestinoLasCierra() {
        let e = Router()
        e.pestana = .mas
        e.go(.settings)
        XCTAssertEqual(e.hoja, .settings)
        XCTAssertEqual(e.pestana, .mas)
        e.go(.welcome)
        XCTAssertEqual(e.hoja, .welcome)
        e.go(.captures)
        XCTAssertNil(e.hoja, "un destino de pestaña baja la hoja que hubiera")
        XCTAssertEqual(e.pestana, .captures)
    }

    func testEsLaNavegacionQueUsanLosIntents() {
        let e: any Navigation = Router()
        e.go(.quickForm(withCamera: false))
        XCTAssertEqual((e as? Router)?.pestana, .register)
    }
}
