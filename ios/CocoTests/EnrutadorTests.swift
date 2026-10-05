import XCTest

@testable import Coco

@MainActor
final class EnrutadorTests: XCTestCase {
    private func url(_ s: String) throws -> URL { try XCTUnwrap(URL(string: s)) }

    func testDestinoDeLasURLsDeLaApp() throws {
        XCTAssertEqual(Enrutador.destino(de: try url("coco://capturar/manual")), .formularioRapido(conCamara: false))
        XCTAssertEqual(Enrutador.destino(de: try url("coco://capturar")), .formularioRapido(conCamara: false))
        XCTAssertEqual(Enrutador.destino(de: try url("coco://capturar/foto")), .formularioRapido(conCamara: true))
        XCTAssertEqual(Enrutador.destino(de: try url("COCO://Capturar/FOTO")), .formularioRapido(conCamara: true))
        XCTAssertEqual(Enrutador.destino(de: try url("coco://capturas")), .capturas)
        XCTAssertEqual(
            Enrutador.destino(de: try url(NotificadorDelSistema.destinoDeCaptura)), .capturas,
            "el aviso de una captura lleva a la lista")
    }

    func testURLsDesconocidasNoSonDestino() throws {
        XCTAssertNil(Enrutador.destino(de: try url("coco://otra")))
        XCTAssertNil(Enrutador.destino(de: try url("coco://capturar/video")))
        XCTAssertNil(Enrutador.destino(de: try url("coco://capturas/1")))
        XCTAssertNil(Enrutador.destino(de: try url("https://dev-cocoapp.viteri.me/capturar/manual")))
        let e = Enrutador()
        XCTAssertFalse(e.abrir(url: try url("coco://otra")))
        XCTAssertEqual(e.pestana, .inicio)
    }

    func testAbrirCambiaLaPestanaYRenuevaElFormulario() throws {
        let e = Enrutador()
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
        let e = Enrutador()
        e.pestana = .mas
        e.ir(.web(ruta: "/centros-de-costos"))
        XCTAssertEqual(e.pestana, .inicio)
        XCTAssertEqual(e.rutaWebPendiente, "/centros-de-costos")
    }

    func testBuscarVaAInicioConLaBusquedaPendiente() {
        let e = Enrutador()
        e.pestana = .capturas
        e.ir(.buscar)
        XCTAssertEqual(e.pestana, .inicio)
        XCTAssertTrue(e.busquedaPendiente)
    }

    func testLasHojasNoCambianDePestanaYUnDestinoLasCierra() {
        let e = Enrutador()
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
        let e: any Navegacion = Enrutador()
        e.ir(.formularioRapido(conCamara: false))
        XCTAssertEqual((e as? Enrutador)?.pestana, .registrar)
    }
}
