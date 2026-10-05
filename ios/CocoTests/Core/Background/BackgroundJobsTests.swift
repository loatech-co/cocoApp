import BackgroundTasks
import XCTest

@testable import Coco

final class BackgroundJobsTests: XCTestCase {
    private var raiz: URL = URL(fileURLWithPath: "/")

    override func setUpWithError() throws {
        raiz = try TemporaryDirectory.directorio()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: raiz)
    }

    func testProgramaConLosIdentificadoresDelInfoPlist() {
        let permitidos = BackgroundJobs.identificadoresPermitidos()
        XCTAssertEqual(
            Set(permitidos), ["co.loatech.coco.renovar", "co.loatech.coco.cola"], "el Info.plist de la app los declara")
        let solicitudes = BackgroundJobs.solicitudes()
        XCTAssertEqual(Set(solicitudes.map(\.identifier)), Set(permitidos))
        XCTAssertTrue(solicitudes.contains { $0 is BGAppRefreshTaskRequest && $0.identifier == BackgroundJobs.renovar })
        let procesado = solicitudes.compactMap { $0 as? BGProcessingTaskRequest }.first
        XCTAssertEqual(procesado?.identifier, BackgroundJobs.cola)
        XCTAssertEqual(procesado?.requiresNetworkConnectivity, true)
    }

    func testProgramarSinRegistroNoTocaElScheduler() throws {
        // `submit` sin registro es una excepción de ObjC, no un `throws`:
        // programar tiene que saltárselo en vez de reventar. La app
        // anfitriona registra al arrancar (M9), así que dentro de ella la
        // prueba no tiene el caso que quiere probar.
        try XCTSkipIf(BackgroundJobs.registradas, "la app anfitriona ya registró las tareas al arrancar")
        BackgroundJobs.programar()
    }

    func testEjecutarColaEnviaLoPendienteYLaColaAvisaUnaVez() async throws {
        let almacen = DiskQueueStore(raiz: raiz)
        let notificador = NotifierDouble()
        let cola = CaptureQueue(
            almacen: almacen, enviador: SenderDouble(), sesion: SessionDouble(), notificador: notificador,
            separacion: .zero, encogerFoto: { $0 })
        // Dos capturas que ya fallaron una vez: lo que se encuentra en fondo.
        for i in 1...2 {
            try almacen.guardar(
                PendingCapture(
                    origen: .iosManual, cuerpo: CaptureBody(comercio: "D\(i)", monto: "1000", fecha: "2026-10-05"),
                    intentos: 1))
        }
        let enviadas = await BackgroundJobs.ejecutarCola(cola: cola, notificador: notificador, presupuesto: .seconds(5))
        XCTAssertEqual(enviadas, 2)
        XCTAssertEqual(notificador.colasEnviadas, [2])
        XCTAssertEqual(notificador.insignias.last, 0)
    }

    func testEjecutarColaSinNadaNoAvisa() async {
        let notificador = NotifierDouble()
        let cola = CaptureQueue(
            almacen: DiskQueueStore(raiz: raiz), enviador: SenderDouble(), sesion: SessionDouble(),
            notificador: notificador, separacion: .zero, encogerFoto: { $0 })
        let enviadas = await BackgroundJobs.ejecutarCola(cola: cola, notificador: notificador, presupuesto: .seconds(5))
        XCTAssertEqual(enviadas, 0)
        XCTAssertEqual(notificador.colasEnviadas, [])
    }

    func testEjecutarRenovacionPideTokenYRefrescaElArbol() async throws {
        let sesion = SessionDouble()
        let transporte = FakeTransport([
            .http(
                200,
                #"{"data":[{"id":1,"name":"Hogar","parent_id":null,"palabras_clave":[],"is_archived":false,"estatico":false,"children":null}],"meta":{}}"#
            )
        ])
        let base = try XCTUnwrap(URL(string: "https://api.coco.invalid"))
        let api = APIClient(configuracion: APIConfiguration(base: base), transporte: transporte, version: "0.1.0")
        let arbol = TreeSynchronizer(
            api: api, sesion: sesion, almacen: DiskTreeStore(archivo: raiz.appending(path: "arbol.json")))

        await BackgroundJobs.ejecutarRenovacion(sesion: sesion, arbol: arbol)

        XCTAssertGreaterThanOrEqual(sesion.lecturasDeToken, 1)
        XCTAssertEqual(transporte.recibidas.map { $0.url?.path }, ["/api/v1/categories"])
        let indice = await arbol.indice()
        XCTAssertEqual(indice?.entradas.map(\.nombre), ["Hogar"])
    }
}
