import Foundation
import Observation
import os

/// The app's composition, done ONCE. Everything that crosses modules is born
/// here and is passed through the initializer: nobody else calls `.shared` or a
/// hidden `.standard`. The tests build it with doubles and no network.
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

    /// Mirror of the session actor's state, so that the views observe it.
    private(set) var sessionState: SessionState = .loading
    /// Captures that have not reached the API yet: the tab's badge.
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

        // The queue counts its pending items every time it changes and tells the
        // notifier (icon badge); it is intercepted there for the tab.
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

        // Before iOS can launch an intent or a background task: in the
        // App's init, not later.
        registerIntents(capturer, router)
        registeredIntents = true
        registerTasks(session, queue, tree, counter)
        registeredTasks = true
    }

    // MARK: Lifecycle

    /// Once, when the root appears: network, observers, web, session, queue.
    func start() async {
        guard !started else { return }
        started = true
        AppLog.app.info("Starting against \(self.configuration.base.absoluteString, privacy: .public)")
        connectivity.start()
        observe()
        bridge.loadHome()
        await session.restore()
        await scheduleExpiry()
        pending = await queue.pending()
        Task { _ = await self.queue.process() }
    }

    /// On returning to the foreground: the tree if it is due, and the queue.
    func returnedToForeground() {
        guard started else { return }
        Task { await self.bridge.notify(.foreground) }
        Task {
            await self.tree.refreshIfNeeded()
            _ = await self.queue.process()
        }
    }

    /// Signing out from More: native logout with the refresh token and a clean
    /// Keychain; the web finds out through the change observer.
    func signOut() async {
        await session.signOut()
    }

    /// A new form with whatever tree is on the phone.
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

    // MARK: Observers

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
        AppLog.session.info("Session: \(Self.name(from: state), privacy: .public)")
        sessionState = state
        switch state {
        case .active:
            // With a document loaded, the web receives the session without reloading;
            // without one, it will ask for it itself through the bridge when it starts.
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

    /// The notice that the personal team's signature expires. With no embedded
    /// profile —simulator— there is nothing to schedule.
    private func scheduleExpiry() async {
        guard let expiresAt = ProvisioningProfileReader.fromBundle() else { return }
        let fireDate = ExpiryReminder.reminderDate(expiresAt: expiresAt, now: .now) ?? .now
        await notifier.scheduleExpiry(
            expiresAt, text: ExpiryReminder.text(expiresAt: expiresAt, now: fireDate).body)
    }

    // MARK: Defaults

    /// Always in `Application Support`. If the disk fails, the queue says so
    /// in Captures instead of hiding in the temporary folder, which iOS empties.
    private static func defaultQueueStore() -> QueueStore {
        DiskQueueStore(root: DiskQueueStore.defaultRoot)
    }

    private static func defaultTreeStore() -> TreeStore {
        DiskTreeStore.atDefaultLocation
    }

    private static func name(from state: SessionState) -> String {
        switch state {
        case .loading: "loading"
        case .signedOut: "signed out"
        // Without the email: the system log can be read by whoever has the
        // phone connected to a Mac, and a personal datum does not have to be there.
        case .active: "active"
        case .offline: "offline"
        }
    }
}

/// Forwards everything to the real notifier and, along the way, counts what the
/// queue says is pending every time it updates the icon badge.
final class PendingCounter: Notifier {
    private let real: Notifier
    private let onCountLock = OSAllocatedUnfairLock<(@MainActor @Sendable (Int) -> Void)?>(initialState: nil)

    var onCount: (@MainActor @Sendable (Int) -> Void)? {
        get { onCountLock.withLock { $0 } }
        set { onCountLock.withLock { $0 = newValue } }
    }

    private let onSavedLock = OSAllocatedUnfairLock<(@MainActor @Sendable () -> Void)?>(initialState: nil)

    /// A capture reached the API: the web has to ask again for what
    /// changes with a new transaction.
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
