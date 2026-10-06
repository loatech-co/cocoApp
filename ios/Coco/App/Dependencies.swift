import Foundation
import Observation
import os

/// La composición de la app, hecha UNA vez. Todo lo que cruza módulos nace
/// aquí y se pasa por el constructor: nadie más llama a `.shared` ni a un
/// `.standard` escondido. Las pruebas la construyen con dobles y sin red.
@Observable @MainActor
final class Dependencies {
    static let shared = Dependencies()

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
    private(set) var sessionState: SessionState = .loading
    /// Capturas que aún no llegaron a la API: la insignia de la pestaña.
    private(set) var pending = 0
    private(set) var started = false
    private(set) var registeredIntents = false
    private(set) var registeredTasks = false

    private var observers: [Task<Void, Never>] = []

    init(
        configuration: APIConfiguration = .current(),
        transport: Transport = URLSessionTransport(),
        keychain: KeychainStore = SystemKeychain(),
        queueStore: QueueStore? = nil,
        treeStore: TreeStore? = nil,
        notifier: Notifier = SystemNotifier(),
        connectivity: Connectivity? = nil,
        defaults: UserDefaults = .standard,
        registerIntents: @escaping IntentRegistration = {
            IntentDependencies.register(capturer: $0, navigation: $1)
        },
        registerTasks: @escaping TaskRegistration = {
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
        let counter = PendingCounter(notifier: notifier)
        self.notifier = counter

        let queue = CaptureQueue(
            store: queueStore ?? Self.defaultQueueStore(),
            sender: APICaptureSender(api: api, session: session),
            session: session,
            notifier: counter
        )
        self.queue = queue
        let capturer = QueuedCapturer(queue: queue, notifier: counter)
        self.capturer = capturer
        let tree = TreeSynchronizer(
            api: api, session: session, store: treeStore ?? Self.defaultTreeStore())
        self.tree = tree
        bridge = WebBridge(session: session, configuration: configuration, navigation: router)

        counter.onCount = { [weak self] n in self?.pending = n }
        counter.onSaved = { [weak self] in
            guard let self else { return }
            Task { await self.bridge.notify(.captured) }
        }

        // Antes de que iOS pueda lanzar un intent o una tarea de fondo: en el
        // init de la App, no después.
        registerIntents(capturer, router)
        registeredIntents = true
        registerTasks(session, queue, tree, counter)
        registeredTasks = true
    }

    // MARK: Ciclo de vida

    /// Una vez, cuando aparece la raíz: red, observadores, web, sesión, cola.
    func start() async {
        guard !started else { return }
        started = true
        AppLog.app.info("Arranca contra \(self.configuration.base.absoluteString, privacy: .public)")
        connectivity.start()
        observe()
        bridge.loadHome()
        await session.restore()
        await scheduleExpiry()
        pending = await queue.pending()
        Task { _ = await self.queue.process() }
    }

    /// Al volver a primer plano: árbol si toca y cola.
    func returnedToForeground() {
        guard started else { return }
        Task { await self.bridge.notify(.foreground) }
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
    func newFormModel() async -> FormModel {
        FormModel(
            index: await tree.index(), api: api, session: session, capturer: capturer, connectivity: connectivity)
    }

    var profile: PublicProfile? {
        switch sessionState {
        case .active(let p): p
        case .offline(let last): last
        case .loading, .signedOut: nil
        }
    }

    var isAdmin: Bool { profile?.role == "admin" }

    var hasSession: Bool {
        switch sessionState {
        case .active, .offline: true
        case .loading, .signedOut: false
        }
    }

    // MARK: Observadores

    private func observe() {
        observers.append(
            Task { [weak self] in
                guard let changes = self?.session.changes else { return }
                for await state in changes {
                    guard let self else { return }
                    await self.sessionChanged(state)
                }
            })
        observers.append(
            Task { [weak self] in
                guard let changes = self?.connectivity.changes else { return }
                for await online in changes where online {
                    guard let self else { return }
                    _ = await self.queue.process()
                }
            })
    }

    private func sessionChanged(_ state: SessionState) async {
        AppLog.session.info("Sesión: \(Self.name(from: state), privacy: .public)")
        sessionState = state
        switch state {
        case .active:
            // Con documento cargado, la web recibe la sesión sin recargar; sin
            // él, la pedirá ella por el puente al arrancar.
            if bridge.hasDocument { await bridge.pushSession() }
            await queue.sessionReturned()
            Task { _ = await self.queue.process() }
            Task { await self.tree.refreshIfNeeded() }
            await requestNotificationPermissionOnce()
            if !WelcomeView.wasSeen(defaults: defaults), router.sheet == nil {
                router.go(.welcome)
            }
        case .signedOut:
            if bridge.hasDocument { bridge.notifySessionClosed() }
        case .offline, .loading:
            break
        }
    }

    nonisolated static let permissionAskedKey = "notification-permission-requested"

    private func requestNotificationPermissionOnce() async {
        guard !defaults.bool(forKey: Self.permissionAskedKey) else { return }
        defaults.set(true, forKey: Self.permissionAskedKey)
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

    /// Siempre en `Application Support`. Si el disco falla, la cola lo dice
    /// en Capturas en vez de esconderse en el temporal, que iOS vacía.
    private static func defaultQueueStore() -> QueueStore {
        DiskQueueStore(root: DiskQueueStore.defaultRoot)
    }

    private static func defaultTreeStore() -> TreeStore {
        DiskTreeStore.atDefaultLocation
    }

    private static func name(from state: SessionState) -> String {
        switch state {
        case .loading: "cargando"
        case .signedOut: "sin sesión"
        // Sin el correo: el registro del sistema lo puede leer quien tenga el
        // teléfono conectado a un Mac, y un dato personal no tiene que estar.
        case .active: "activa"
        case .offline: "sin conexión"
        }
    }
}

/// Reenvía todo al notificador real y, de paso, cuenta lo que la cola dice
/// que está pendiente cada vez que actualiza la insignia del icono.
final class PendingCounter: Notifier {
    private let real: Notifier
    private let onCountLock = OSAllocatedUnfairLock<(@MainActor @Sendable (Int) -> Void)?>(initialState: nil)

    var onCount: (@MainActor @Sendable (Int) -> Void)? {
        get { onCountLock.withLock { $0 } }
        set { onCountLock.withLock { $0 = newValue } }
    }

    private let onSavedLock = OSAllocatedUnfairLock<(@MainActor @Sendable () -> Void)?>(initialState: nil)

    /// Una captura llegó a la API: la web tiene que volver a pedir lo que
    /// cambia con un movimiento nuevo.
    var onSaved: (@MainActor @Sendable () -> Void)? {
        get { onSavedLock.withLock { $0 } }
        set { onSavedLock.withLock { $0 = newValue } }
    }

    init(notifier: Notifier) {
        real = notifier
    }

    func requestPermission() async -> Bool { await real.requestPermission() }
    func captureSaved(_ r: SavedResult, source: CaptureSource) async {
        if let onSaved { await onSaved() }
        await real.captureSaved(r, source: source)
    }
    func captureFailed(reason: String) async { await real.captureFailed(reason: reason) }
    func queueSent(count: Int) async { await real.queueSent(count: count) }
    func scheduleExpiry(_ expiresAt: Date, text: String) async {
        await real.scheduleExpiry(expiresAt, text: text)
    }
    func setBadge(_ n: Int) async {
        if let onCount { await onCount(n) }
        await real.setBadge(n)
    }
}
