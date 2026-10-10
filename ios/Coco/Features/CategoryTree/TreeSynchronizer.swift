import Foundation

/// Keeps the phone's tree up to date with `GET /categories` and serves the
/// index to whoever searches. Who calls it (launch, foreground, login,
/// capture sent) is the app's business; here it is only decided whether it is needed.
final actor TreeSynchronizer {
    private let api: APIClient
    private let session: Session
    private let store: TreeStore
    private let clock: @Sendable () -> Date

    private var saved: SavedTree?
    private var cachedIndex: TreeIndex?
    private var loadedFromDisk = false
    /// Two refreshes at once are two downloads of the same tree: the second one
    /// waits for the first.
    private var refreshInFlight: Task<Void, Error>?

    init(api: APIClient, session: Session, store: TreeStore, clock: @Sendable @escaping () -> Date = Date.init) {
        self.api = api
        self.session = session
        self.store = store
        self.clock = clock
    }

    /// What is saved, without touching the network. `nil` if nothing was ever downloaded.
    func index() async -> TreeIndex? {
        loadFromDiskIfNeeded()
        return cachedIndex
    }

    /// Downloads the tree if what is saved is older than `maxAge` or there is nothing. The
    /// errors —network, session— are swallowed: without network what is saved is used.
    func refreshIfNeeded(maxAge: Duration = .seconds(3600)) async {
        loadFromDiskIfNeeded()
        if let saved {
            let age = clock().timeIntervalSince(saved.downloadedAt)
            let limit = TimeInterval(maxAge.components.seconds) + TimeInterval(maxAge.components.attoseconds) / 1e18
            if age >= 0, age < limit { return }
        }
        try? await refreshNow()
    }

    /// `GET /categories` right now, whatever is saved.
    func refreshNow() async throws {
        if let inFlight = refreshInFlight {
            return try await inFlight.value
        }
        let task = Task { try await self.download() }
        refreshInFlight = task
        defer { refreshInFlight = nil }
        try await task.value
    }

    private func download() async throws {
        let token = try await session.validAccessToken()
        let roots: [TreeNode] = try await api.sendAllPages(RequestBuilder.categories(page:), token: token)
        let newTree = SavedTree(roots: roots, downloadedAt: clock())
        // If the disk fails the index works all the same in this run; the
        // next one downloads it again.
        try? store.save(newTree)
        saved = newTree
        cachedIndex = TreeIndex(roots: roots)
        loadedFromDisk = true
    }

    private func loadFromDiskIfNeeded() {
        guard !loadedFromDisk else { return }
        loadedFromDisk = true
        // A corrupt file counts as there being nothing: it is downloaded again.
        guard let loaded = try? store.load() else { return }
        saved = loaded
        cachedIndex = TreeIndex(roots: loaded.roots)
    }
}
