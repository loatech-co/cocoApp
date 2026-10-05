import BackgroundTasks
import XCTest
@testable import Coco

final class TareasDeFondoTests: XCTestCase {
    private var raiz: URL = URL(fileURLWithPath: "/")

    override func setUpWithError() throws {
        raiz = try Temporal.directorio()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: raiz)
    }

    func testProgramaConLosIdentificadoresDelInfoPlist() {
        let permitidos = TareasDeFondo.identificadoresPermitidos()
        XCTAssertEqual(Set(permitidos), ["co.loatech.coco.renovar", "co.loatech.coco.cola"], "el Info.plist de la app los declara")
        let solicitudes = TareasDeFondo.solicitudes()
        XCTAssertEqual(Set(solicitudes.map(\.identifier)), Set(permitidos))
        XCTAssertTrue(solicitudes.contains { $0 is BGAppRefreshTaskRequest && $0.identifier == TareasDeFondo.renovar })
        let procesado = solicitudes.compactMap { $0 as? BGProcessingTaskRequest }.first
        XCTAssertEqual(procesado?.identifier, TareasDeFondo.cola)
        XCTAssertEqual(procesado?.requiresNetworkConnectivity, true)
    }

    func testProgramarSinRegistroNoTocaElScheduler() throws {
        // `submit` sin registro es una excepción de ObjC, no un `throws`:
        // programar tiene que saltárselo en vez de reventar. La app
        // anfitriona registra al arrancar (M9), así que dentro de ella la
        // prueba no tiene el caso que quiere probar.
        try XCTSkipIf(TareasDeFondo.registradas, "la app anfitriona ya registró las tareas al arrancar")
        TareasDeFondo.programar()
    }

    func testEjecutarColaEnviaLoPendienteYLaColaAvisaUnaVez() async throws {
        let almacen = AlmacenDeColaEnDisco(raiz: raiz)
        let notificador = NotificadorDoble()
        let cola = ColaDeCapturas(almacen: almacen, enviador: EnviadorDoble(), sesion: SesionDoble(), notificador: notificador, separacion: .zero, encogerFoto: { $0 })
        // Dos capturas que ya fallaron una vez: lo que se encuentra en fondo.
        for i in 1...2 {
            try almacen.guardar(CapturaPendiente(origen: .iosManual, cuerpo: CuerpoDeCaptura(comercio: "D\(i)", monto: "1000", fecha: "2026-10-05"), intentos: 1))
        }
        let enviadas = await TareasDeFondo.ejecutarCola(cola: cola, notificador: notificador, presupuesto: .seconds(5))
        XCTAssertEqual(enviadas, 2)
        XCTAssertEqual(notificador.colasEnviadas, [2])
        XCTAssertEqual(notificador.insignias.last, 0)
    }

    func testEjecutarColaSinNadaNoAvisa() async {
        let notificador = NotificadorDoble()
        let cola = ColaDeCapturas(almacen: AlmacenDeColaEnDisco(raiz: raiz), enviador: EnviadorDoble(), sesion: SesionDoble(), notificador: notificador, separacion: .zero, encogerFoto: { $0 })
        let enviadas = await TareasDeFondo.ejecutarCola(cola: cola, notificador: notificador, presupuesto: .seconds(5))
        XCTAssertEqual(enviadas, 0)
        XCTAssertEqual(notificador.colasEnviadas, [])
    }

    func testEjecutarRenovacionPideTokenYRefrescaElArbol() async throws {
        let sesion = SesionDoble()
        let transporte = TransporteFalso([.http(200, #"{"data":[{"id":1,"name":"Hogar","parent_id":null,"palabras_clave":[],"is_archived":false,"estatico":false,"children":null}],"meta":{}}"#)])
        let base = try XCTUnwrap(URL(string: "https://api.coco.invalid"))
        let api = ClienteAPI(configuracion: ConfiguracionDeLaAPI(base: base), transporte: transporte, version: "0.1.0")
        let arbol = SincronizadorDelArbol(api: api, sesion: sesion, almacen: AlmacenDelArbolEnDisco(archivo: raiz.appending(path: "arbol.json")))

        await TareasDeFondo.ejecutarRenovacion(sesion: sesion, arbol: arbol)

        XCTAssertGreaterThanOrEqual(sesion.lecturasDeToken, 1)
        XCTAssertEqual(transporte.recibidas.map { $0.url?.path }, ["/api/v1/categories"])
        let indice = await arbol.indice()
        XCTAssertEqual(indice?.entradas.map(\.nombre), ["Hogar"])
    }
}
