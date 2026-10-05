import XCTest

@testable import Coco

/// La composición se construye sin red ni disco de la app y deja registrado
/// lo que los intents y las tareas de fondo necesitan.
@MainActor
final class DependenciesTests: XCTestCase {
    private var root: URL = URL(fileURLWithPath: "/")

    override func setUpWithError() throws {
        root = try TemporaryDirectory.directory()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func construir(
        transport: FakeTransport = FakeTransport(), llavero: InMemoryKeychain = InMemoryKeychain(),
        notifier: NotifierDouble = NotifierDouble()
    ) throws -> (Dependencies, Registry) {
        let registry = Registry()
        let base = try XCTUnwrap(URL(string: "https://api.coco.invalid"))
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "pruebas-\(UUID().uuidString)"))
        let d = Dependencies(
            configuration: APIConfiguration(base: base),
            transport: transport,
            llavero: llavero,
            almacenDeCola: DiskQueueStore(root: root),
            almacenDelArbol: DiskTreeStore(file: root.appending(path: "arbol.json")),
            notifier: notifier,
            defaults: defaults,
            registrarIntents: { capturer, navigation in registry.intents = (capturer, navigation) },
            registrarTareas: { session, queue, tree, notifier in
                registry.tareas = .init(session: session, queue: queue, tree: tree, notifier: notifier)
            }
        )
        return (d, registry)
    }

    final class Registry {
        var intents: (any Capturer, any Navigation)?
        var tareas: RegisteredTasks?
    }

    func testRegistraIntentsYTareasConLasMismasPiezasQueUsaLaApp() throws {
        let (d, registry) = try construir()
        XCTAssertTrue(d.intentsRegistrados)
        XCTAssertTrue(d.tareasRegistradas)

        let intents = try XCTUnwrap(registry.intents)
        XCTAssertTrue((intents.0 as AnyObject) is QueuedCapturer || intents.0 is QueuedCapturer)
        XCTAssertTrue(intents.1 === d.enrutador, "los intents navegan por el mismo enrutador que la interfaz")

        let tareas = try XCTUnwrap(registry.tareas)
        XCTAssertTrue(tareas.session === d.session)
        XCTAssertTrue(tareas.queue === d.queue)
        XCTAssertTrue(tareas.tree === d.tree)
    }

    func testElPuenteYLaWebApuntanALaMismaAPI() throws {
        let (d, _) = try construir()
        XCTAssertEqual(d.configuration.base.absoluteString, "https://api.coco.invalid")
        XCTAssertEqual(d.api.configuration, d.configuration)
        XCTAssertTrue(
            WebBridge.origenPermitido(
                protocolo: "https", host: "api.coco.invalid", puerto: 0, base: d.configuration.base,
                esFramePrincipal: true))
    }

    func testArrancarSinRefreshQuedaSinSesionYNoTocaLaRed() async throws {
        let transport = FakeTransport()
        let (d, _) = try construir(transport: transport)
        XCTAssertEqual(d.estadoDeSesion, .loading)
        await d.arrancar()
        XCTAssertTrue(d.arrancada)
        // El estado llega por el flujo de cambios del actor.
        for _ in 0..<50 where d.estadoDeSesion == .loading {
            try await Task.sleep(for: .milliseconds(20))
        }
        XCTAssertEqual(d.estadoDeSesion, .signedOut)
        XCTAssertFalse(d.haySesion)
        XCTAssertNil(d.profile)
        XCTAssertEqual(
            transport.received.filter { $0.url?.path.hasPrefix("/api/v1") == true }, [],
            "sin refresh no hay nada que renovar")
        await d.arrancar()
        XCTAssertTrue(d.arrancada, "arrancar dos veces no vuelve a hacer nada")
    }

    func testLaInsigniaDePendientesSigueALaCola() async throws {
        let notifier = NotifierDouble()
        let (d, _) = try construir(notifier: notifier)
        XCTAssertEqual(d.pending, 0)
        try await d.queue.enqueue(
            CaptureBody(merchant: "D1", amount: "1000", date: "2026-10-05"), source: .iosManual, photo: nil)
        for _ in 0..<50 where d.pending == 0 {
            try await Task.sleep(for: .milliseconds(20))
        }
        XCTAssertEqual(d.pending, 1)
        XCTAssertEqual(notifier.badges.last, 1, "el notificador real también recibe la cuenta")
    }

    func testEsAdminSoloConElRol() throws {
        let profile = PublicProfile(
            id: 1, email: "a@coco.test", displayName: nil, role: "admin", status: "active",
            createdAt: "2026-01-01T00:00:00Z")
        XCTAssertEqual(profile.role, "admin")
        let (d, _) = try construir()
        XCTAssertFalse(d.esAdmin)
    }
}

final class SignInViewTests: XCTestCase {
    func testMensajesDeErrorDicenQueHacer() {
        XCTAssertEqual(SignInView.message(de: APIError.unauthenticated), "Correo o contraseña incorrectos.")
        XCTAssertEqual(
            SignInView.message(de: URLError(.notConnectedToInternet)),
            "Sin conexión. Revisa la red e inténtalo otra vez.")
        XCTAssertEqual(
            SignInView.message(de: APIError.timedOut), "La API no respondió a tiempo. Inténtalo otra vez.")
        XCTAssertEqual(
            SignInView.message(de: APIError.rejected(status: 400, code: "x", message: "El correo no es válido.")),
            "El correo no es válido.")
        XCTAssertEqual(
            SignInView.message(de: APIError.server(status: 429)), "Demasiados intentos. Espera un minuto.")
        XCTAssertTrue(SignInView.message(de: APIError.unreadableResponse).contains("Ajustes"))
    }
}

final class SettingsViewTests: XCTestCase {
    func testValidaLaURLDeLaAPI() throws {
        XCTAssertEqual(SettingsView.validar("http://localhost:3000/").url, URL(string: "http://localhost:3000"))
        XCTAssertEqual(
            SettingsView.validar("  https://dev-cocoapp.viteri.me ").url, URL(string: "https://dev-cocoapp.viteri.me"))
        XCTAssertNil(SettingsView.validar("").reason, "vacía no es un error, solo no se puede guardar")
        XCTAssertNil(SettingsView.validar("").url)
        XCTAssertNotNil(SettingsView.validar("localhost").reason)
        XCTAssertNotNil(SettingsView.validar("ftp://x.y").reason)
        XCTAssertNotNil(SettingsView.validar("https://x.y/api/v1").reason, "la app añade /api/v1")
    }

    func testTextoDeVencimiento() throws {
        let now = try XCTUnwrap(Calendar.current.date(from: DateComponents(year: 2026, month: 10, day: 5, hour: 12)))
        XCTAssertEqual(SettingsView.textoDeVencimiento(nil), "No disponible (simulador o sin perfil)")
        XCTAssertTrue(
            SettingsView.textoDeVencimiento(now.addingTimeInterval(5 * 86_400), now: now).contains(
                "quedan 5 días")
        )
        XCTAssertTrue(
            SettingsView.textoDeVencimiento(now.addingTimeInterval(86_400), now: now).hasPrefix("Mañana"))
        XCTAssertTrue(
            SettingsView.textoDeVencimiento(now.addingTimeInterval(-86_400), now: now).hasPrefix("Caducó"))
    }
}

/// Las piezas que la app entrega al registrar las tareas de fondo.
struct RegisteredTasks {
    let session: Session
    let queue: CaptureQueue
    let tree: TreeSynchronizer
    let notifier: Notifier
}
