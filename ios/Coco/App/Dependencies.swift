import Foundation
import Observation

/// La composición de la app, hecha UNA vez. Todo lo que cruza módulos nace
/// aquí y se pasa por el constructor: nadie más llama a `.shared` ni a un
/// `.standard` escondido. Las pruebas la construyen con dobles y sin red.
@Observable @MainActor
final class Dependencies {
    static let compartidas = Dependencies()

    typealias IntentRegistration = @MainActor (any Capturer, any Navigation) -> Void
    typealias TaskRegistration = @MainActor (Session, CaptureQueue, TreeSynchronizer, Notifier) -> Void

    let configuration: APIConfiguration
    let api: APIClient
    let session: Session
    let queue: CaptureQueue
    let capturer: QueuedCapturer
    let tree: TreeSynchronizer
    let bridge: WebBridge
    let notifier: Notifier
    let connectivity: Connectivity
    let router: Router
    let defaults: UserDefaults

    /// Espejo del estado del actor de sesión, para que las vistas lo observen.
    private(set) var estadoDeSesion: SessionState = .loading
    /// Capturas que aún no llegaron a la API: la insignia de la pestaña.
    private(set) var pending = 0
    private(set) var arrancada = false
    private(set) var intentsRegistrados = false
    private(set) var tareasRegistradas = false

    private var observadores: [Task<Void, Never>] = []

    init(
        configuration: APIConfiguration = .current(),
        transport: Transport = URLSessionTransport(),
        keychain: KeychainStore = SystemKeychain(),
        almacenDeCola: QueueStore? = nil,
        almacenDelArbol: TreeStore? = nil,
        notifier: Notifier = SystemNotifier(),
        connectivity: Connectivity? = nil,
        defaults: UserDefaults = .standard,
        registrarIntents: @escaping IntentRegistration = {
            IntentDependencies.register(capturer: $0, navigation: $1)
        },
        registrarTareas: @escaping TaskRegistration = {
            BackgroundJobs.register(session: $0, queue: $1, tree: $2, notifier: $3)
        }
    ) {
        self.configuration = configuration
        self.defaults = defaults
        self.connectivity = connectivity ?? Connectivity()
        let api = APIClient(configuration: configuration, transport: transport)
        self.api = api
        let session = NativeSession(api: api, keychain: keychain)
        self.session = session
        let router = Router()
        self.router = router

        // La cola cuenta sus pendientes cada vez que cambia y se lo dice al
        // notificador (insignia del icono); se intercepta ahí para la pestaña.
        let contador = PendingCounter(notifier: notifier)
        self.notifier = contador

        let queue = CaptureQueue(
            store: almacenDeCola ?? Self.almacenDeColaPorDefecto(),
            sender: APICaptureSender(api: api, session: session),
            session: session,
            notifier: contador
        )
        self.queue = queue
        let capturer = QueuedCapturer(queue: queue, notifier: contador)
        self.capturer = capturer
        let tree = TreeSynchronizer(
            api: api, session: session, store: almacenDelArbol ?? Self.almacenDelArbolPorDefecto())
        self.tree = tree
        bridge = WebBridge(session: session, configuration: configuration, navigation: router)

        contador.alContar = { [weak self] n in self?.pending = n }

        // Antes de que iOS pueda lanzar un intent o una tarea de fondo: en el
        // init de la App, no después.
        registrarIntents(capturer, router)
        intentsRegistrados = true
        registrarTareas(session, queue, tree, contador)
        tareasRegistradas = true
    }

    // MARK: Ciclo de vida

    /// Una vez, cuando aparece la raíz: red, observadores, web, sesión, cola.
    func arrancar() async {
        guard !arrancada else { return }
        arrancada = true
        AppLog.app.info("Arranca contra \(self.configuration.base.absoluteString, privacy: .public)")
        connectivity.start()
        observar()
        bridge.loadHome()
        await session.restore()
        await scheduleExpiry()
        pending = await queue.pending()
        Task { _ = await self.queue.process() }
    }

    /// Al volver a primer plano: árbol si toca y cola.
    func volvioAPrimerPlano() {
        guard arrancada else { return }
        Task {
            await self.tree.refreshIfNeeded()
            _ = await self.queue.process()
        }
    }

    /// Cerrar sesión desde Más: logout nativo con el refresh y Keychain
    /// limpio; la web se entera por el observador de cambios.
    func signOut() async {
        await session.signOut()
    }

    /// Un formulario nuevo con el árbol que haya en el teléfono.
    func nuevoModeloDelFormulario() async -> FormModel {
        FormModel(
            index: await tree.index(), api: api, session: session, capturer: capturer, connectivity: connectivity)
    }

    var profile: PublicProfile? {
        switch estadoDeSesion {
        case .active(let p): p
        case .offline(let last): last
        case .loading, .signedOut: nil
        }
    }

    var esAdmin: Bool { profile?.role == "admin" }

    var haySesion: Bool {
        switch estadoDeSesion {
        case .active, .offline: true
        case .loading, .signedOut: false
        }
    }

    // MARK: Observadores

    private func observar() {
        observadores.append(
            Task { [weak self] in
                guard let changes = self?.session.changes else { return }
                for await state in changes {
                    guard let self else { return }
                    await self.sesionCambio(state)
                }
            })
        observadores.append(
            Task { [weak self] in
                guard let changes = self?.connectivity.changes else { return }
                for await hay in changes where hay {
                    guard let self else { return }
                    _ = await self.queue.process()
                }
            })
    }

    private func sesionCambio(_ state: SessionState) async {
        AppLog.session.info("Sesión: \(Self.name(from: state), privacy: .public)")
        estadoDeSesion = state
        switch state {
        case .active:
            // Con documento cargado, la web recibe la sesión sin recargar; sin
            // él, la pedirá ella por el puente al arrancar.
            if bridge.hasDocument { await bridge.pushSession() }
            await queue.sessionReturned()
            Task { _ = await self.queue.process() }
            Task { await self.tree.refreshIfNeeded() }
            await pedirPermisoDeAvisosLaPrimeraVez()
            if !WelcomeView.yaVista(defaults: defaults), router.hoja == nil {
                router.go(.welcome)
            }
        case .signedOut:
            if bridge.hasDocument { bridge.notifySessionClosed() }
        case .offline, .loading:
            break
        }
    }

    private static let clavePermisoPedido = "permiso-de-avisos-pedido"

    private func pedirPermisoDeAvisosLaPrimeraVez() async {
        guard !defaults.bool(forKey: Self.clavePermisoPedido) else { return }
        defaults.set(true, forKey: Self.clavePermisoPedido)
        _ = await notifier.requestPermission()
    }

    /// El aviso de que la firma del equipo personal caduca. Sin perfil
    /// embebido —simulador— no hay nada que programar.
    private func scheduleExpiry() async {
        guard let expiresAt = ProvisioningProfileReader.fromBundle() else { return }
        let fireDate = ExpiryReminder.reminderDate(expiresAt: expiresAt, now: .now) ?? .now
        await notifier.scheduleExpiry(
            expiresAt, text: ExpiryReminder.text(expiresAt: expiresAt, now: fireDate).body)
    }

    // MARK: Por defecto

    /// Si el disco de la app no se deja crear, la cola va al temporal: peor
    /// que lo normal, pero mejor que arrancar sin cola.
    private static func almacenDeColaPorDefecto() -> QueueStore {
        let root =
            (try? DiskQueueStore.defaultRoot())
            ?? FileManager.default.temporaryDirectory.appending(path: "cola", directoryHint: .isDirectory)
        return DiskQueueStore(root: root)
    }

    private static func almacenDelArbolPorDefecto() -> TreeStore {
        (try? DiskTreeStore.atDefaultLocation())
            ?? DiskTreeStore(file: FileManager.default.temporaryDirectory.appending(path: "arbol.json"))
    }

    private static func name(from state: SessionState) -> String {
        switch state {
        case .loading: "cargando"
        case .signedOut: "sin sesión"
        case .active(let p): "activa (\(p.email))"
        case .offline: "sin conexión"
        }
    }
}

/// Reenvía todo al notificador real y, de paso, cuenta lo que la cola dice
/// que está pendiente cada vez que actualiza la insignia del icono.
final class PendingCounter: Notifier, @unchecked Sendable {
    private let real: Notifier
    private let lock = NSLock()
    private var _alContar: (@MainActor (Int) -> Void)?

    var alContar: (@MainActor (Int) -> Void)? {
        get { lock.withLock { _alContar } }
        set { lock.withLock { _alContar = newValue } }
    }

    init(notifier: Notifier) {
        real = notifier
    }

    func requestPermission() async -> Bool { await real.requestPermission() }
    func captureSaved(_ r: SavedResult, source: CaptureSource) async {
        await real.captureSaved(r, source: source)
    }
    func captureFailed(reason: String) async { await real.captureFailed(reason: reason) }
    func queueSent(count: Int) async { await real.queueSent(count: count) }
    func scheduleExpiry(_ expiresAt: Date, text: String) async {
        await real.scheduleExpiry(expiresAt, text: text)
    }
    func setBadge(_ n: Int) async {
        if let alContar { await alContar(n) }
        await real.setBadge(n)
    }
}
