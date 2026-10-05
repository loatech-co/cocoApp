import XCTest

@testable import Coco

/// La composición se construye sin red ni disco de la app y deja registrado
/// lo que los intents y las tareas de fondo necesitan.
@MainActor
final class DependenciesTests: XCTestCase {
    private var raiz: URL = URL(fileURLWithPath: "/")

    override func setUpWithError() throws {
        raiz = try TemporaryDirectory.directorio()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: raiz)
    }

    private func construir(
        transporte: FakeTransport = FakeTransport(), llavero: InMemoryKeychain = InMemoryKeychain(),
        notificador: NotifierDouble = NotifierDouble()
    ) throws -> (Dependencies, Registry) {
        let registro = Registry()
        let base = try XCTUnwrap(URL(string: "https://api.coco.invalid"))
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "pruebas-\(UUID().uuidString)"))
        let d = Dependencies(
            configuracion: APIConfiguration(base: base),
            transporte: transporte,
            llavero: llavero,
            almacenDeCola: DiskQueueStore(raiz: raiz),
            almacenDelArbol: DiskTreeStore(archivo: raiz.appending(path: "arbol.json")),
            notificador: notificador,
            defaults: defaults,
            registrarIntents: { capturador, navegacion in registro.intents = (capturador, navegacion) },
            registrarTareas: { sesion, cola, arbol, notificador in
                registro.tareas = .init(sesion: sesion, cola: cola, arbol: arbol, notificador: notificador)
            }
        )
        return (d, registro)
    }

    final class Registry {
        var intents: (any Capturer, any Navigation)?
        var tareas: RegisteredTasks?
    }

    func testRegistraIntentsYTareasConLasMismasPiezasQueUsaLaApp() throws {
        let (d, registro) = try construir()
        XCTAssertTrue(d.intentsRegistrados)
        XCTAssertTrue(d.tareasRegistradas)

        let intents = try XCTUnwrap(registro.intents)
        XCTAssertTrue((intents.0 as AnyObject) is QueuedCapturer || intents.0 is QueuedCapturer)
        XCTAssertTrue(intents.1 === d.enrutador, "los intents navegan por el mismo enrutador que la interfaz")

        let tareas = try XCTUnwrap(registro.tareas)
        XCTAssertTrue(tareas.sesion === d.sesion)
        XCTAssertTrue(tareas.cola === d.cola)
        XCTAssertTrue(tareas.arbol === d.arbol)
    }

    func testElPuenteYLaWebApuntanALaMismaAPI() throws {
        let (d, _) = try construir()
        XCTAssertEqual(d.configuracion.base.absoluteString, "https://api.coco.invalid")
        XCTAssertEqual(d.api.configuracion, d.configuracion)
        XCTAssertTrue(
            WebBridge.origenPermitido(
                protocolo: "https", host: "api.coco.invalid", puerto: 0, base: d.configuracion.base,
                esFramePrincipal: true))
    }

    func testArrancarSinRefreshQuedaSinSesionYNoTocaLaRed() async throws {
        let transporte = FakeTransport()
        let (d, _) = try construir(transporte: transporte)
        XCTAssertEqual(d.estadoDeSesion, .cargando)
        await d.arrancar()
        XCTAssertTrue(d.arrancada)
        // El estado llega por el flujo de cambios del actor.
        for _ in 0..<50 where d.estadoDeSesion == .cargando {
            try await Task.sleep(for: .milliseconds(20))
        }
        XCTAssertEqual(d.estadoDeSesion, .sinSesion)
        XCTAssertFalse(d.haySesion)
        XCTAssertNil(d.perfil)
        XCTAssertEqual(
            transporte.recibidas.filter { $0.url?.path.hasPrefix("/api/v1") == true }, [],
            "sin refresh no hay nada que renovar")
        await d.arrancar()
        XCTAssertTrue(d.arrancada, "arrancar dos veces no vuelve a hacer nada")
    }

    func testLaInsigniaDePendientesSigueALaCola() async throws {
        let notificador = NotifierDouble()
        let (d, _) = try construir(notificador: notificador)
        XCTAssertEqual(d.pendientes, 0)
        try await d.cola.encolar(
            CaptureBody(comercio: "D1", monto: "1000", fecha: "2026-10-05"), origen: .iosManual, foto: nil)
        for _ in 0..<50 where d.pendientes == 0 {
            try await Task.sleep(for: .milliseconds(20))
        }
        XCTAssertEqual(d.pendientes, 1)
        XCTAssertEqual(notificador.insignias.last, 1, "el notificador real también recibe la cuenta")
    }

    func testEsAdminSoloConElRol() throws {
        let perfil = PublicProfile(
            id: 1, email: "a@coco.test", displayName: nil, role: "admin", status: "active",
            createdAt: "2026-01-01T00:00:00Z")
        XCTAssertEqual(perfil.role, "admin")
        let (d, _) = try construir()
        XCTAssertFalse(d.esAdmin)
    }
}

final class SignInViewTests: XCTestCase {
    func testMensajesDeErrorDicenQueHacer() {
        XCTAssertEqual(SignInView.mensaje(de: APIError.noAutenticado), "Correo o contraseña incorrectos.")
        XCTAssertEqual(
            SignInView.mensaje(de: URLError(.notConnectedToInternet)),
            "Sin conexión. Revisa la red e inténtalo otra vez.")
        XCTAssertEqual(
            SignInView.mensaje(de: APIError.tiempoAgotado), "La API no respondió a tiempo. Inténtalo otra vez.")
        XCTAssertEqual(
            SignInView.mensaje(de: APIError.rechazada(status: 400, code: "x", mensaje: "El correo no es válido.")),
            "El correo no es válido.")
        XCTAssertEqual(
            SignInView.mensaje(de: APIError.servidor(status: 429)), "Demasiados intentos. Espera un minuto.")
        XCTAssertTrue(SignInView.mensaje(de: APIError.respuestaIlegible).contains("Ajustes"))
    }
}

final class SettingsViewTests: XCTestCase {
    func testValidaLaURLDeLaAPI() throws {
        XCTAssertEqual(SettingsView.validar("http://localhost:3000/").url, URL(string: "http://localhost:3000"))
        XCTAssertEqual(
            SettingsView.validar("  https://dev-cocoapp.viteri.me ").url, URL(string: "https://dev-cocoapp.viteri.me"))
        XCTAssertNil(SettingsView.validar("").motivo, "vacía no es un error, solo no se puede guardar")
        XCTAssertNil(SettingsView.validar("").url)
        XCTAssertNotNil(SettingsView.validar("localhost").motivo)
        XCTAssertNotNil(SettingsView.validar("ftp://x.y").motivo)
        XCTAssertNotNil(SettingsView.validar("https://x.y/api/v1").motivo, "la app añade /api/v1")
    }

    func testTextoDeVencimiento() throws {
        let ahora = try XCTUnwrap(Calendar.current.date(from: DateComponents(year: 2026, month: 10, day: 5, hour: 12)))
        XCTAssertEqual(SettingsView.textoDeVencimiento(nil), "No disponible (simulador o sin perfil)")
        XCTAssertTrue(
            SettingsView.textoDeVencimiento(ahora.addingTimeInterval(5 * 86_400), ahora: ahora).contains(
                "quedan 5 días")
        )
        XCTAssertTrue(
            SettingsView.textoDeVencimiento(ahora.addingTimeInterval(86_400), ahora: ahora).hasPrefix("Mañana"))
        XCTAssertTrue(
            SettingsView.textoDeVencimiento(ahora.addingTimeInterval(-86_400), ahora: ahora).hasPrefix("Caducó"))
    }
}

/// Las piezas que la app entrega al registrar las tareas de fondo.
struct RegisteredTasks {
    let sesion: Session
    let cola: CaptureQueue
    let arbol: TreeSynchronizer
    let notificador: Notifier
}
