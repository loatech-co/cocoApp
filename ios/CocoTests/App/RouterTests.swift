import XCTest

@testable import Coco

@MainActor
final class RouterTests: XCTestCase {
    private func url(_ s: String) throws -> URL { try XCTUnwrap(URL(string: s)) }

    func testDestinoDeLasURLsDeLaApp() throws {
        XCTAssertEqual(Router.destino(de: try url("coco://capturar/manual")), .formularioRapido(conCamara: false))
        XCTAssertEqual(Router.destino(de: try url("coco://capturar")), .formularioRapido(conCamara: false))
        XCTAssertEqual(Router.destino(de: try url("coco://capturar/foto")), .formularioRapido(conCamara: true))
        XCTAssertEqual(Router.destino(de: try url("COCO://Capturar/FOTO")), .formularioRapido(conCamara: true))
        XCTAssertEqual(Router.destino(de: try url("coco://capturas")), .capturas)
        XCTAssertEqual(
            Router.destino(de: try url(SystemNotifier.destinoDeCaptura)), .capturas,
            "el aviso de una captura lleva a la lista")
    }

    func testURLsDesconocidasNoSonDestino() throws {
        XCTAssertNil(Router.destino(de: try url("coco://otra")))
        XCTAssertNil(Router.destino(de: try url("coco://capturar/video")))
        XCTAssertNil(Router.destino(de: try url("coco://capturas/1")))
        XCTAssertNil(Router.destino(de: try url("https://dev-cocoapp.viteri.me/capturar/manual")))
        let e = Router()
        XCTAssertFalse(e.abrir(url: try url("coco://otra")))
        XCTAssertEqual(e.pestana, .inicio)
    }

    func testAbrirCambiaLaPestanaYRenuevaElFormulario() throws {
        let e = Router()
        let antes = e.formulario.generacion
        XCTAssertTrue(e.abrir(url: try url("coco://capturar/foto")))
        XCTAssertEqual(e.pestana, .registrar)
        XCTAssertTrue(e.formulario.conCamara)
        XCTAssertEqual(e.formulario.generacion, antes + 1)

        XCTAssertTrue(e.abrir(url: try url("coco://capturar/manual")))
        XCTAssertFalse(e.formulario.conCamara)
        XCTAssertEqual(e.formulario.generacion, antes + 2, "cada petición es un formulario nuevo")

        XCTAssertTrue(e.abrir(url: try url("coco://capturas")))
        XCTAssertEqual(e.pestana, .capturas)
    }

    func testIrAWebDejaLaRutaPendienteEnInicio() {
        let e = Router()
        e.pestana = .mas
        e.ir(.web(ruta: "/centros-de-costos"))
        XCTAssertEqual(e.pestana, .inicio)
        XCTAssertEqual(e.rutaWebPendiente, "/centros-de-costos")
    }

    func testBuscarVaAInicioConLaBusquedaPendiente() {
        let e = Router()
        e.pestana = .capturas
        e.ir(.buscar)
        XCTAssertEqual(e.pestana, .inicio)
        XCTAssertTrue(e.busquedaPendiente)
    }

    func testLasHojasNoCambianDePestanaYUnDestinoLasCierra() {
        let e = Router()
        e.pestana = .mas
        e.ir(.ajustes)
        XCTAssertEqual(e.hoja, .ajustes)
        XCTAssertEqual(e.pestana, .mas)
        e.ir(.bienvenida)
        XCTAssertEqual(e.hoja, .bienvenida)
        e.ir(.capturas)
        XCTAssertNil(e.hoja, "un destino de pestaña baja la hoja que hubiera")
        XCTAssertEqual(e.pestana, .capturas)
    }

    func testEsLaNavegacionQueUsanLosIntents() {
        let e: any Navigation = Router()
        e.ir(.formularioRapido(conCamara: false))
        XCTAssertEqual((e as? Router)?.pestana, .registrar)
    }
}
