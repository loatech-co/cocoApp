import Foundation

/// Mantiene el árbol del teléfono al día con `GET /categories` y sirve el
/// índice a quien busque. Quién lo llama (arranque, primer plano, login,
/// captura enviada) es cosa de la app; aquí solo se decide si hace falta.
final actor TreeSynchronizer {
    private let api: APIClient
    private let session: Session
    private let store: TreeStore
    private let clock: @Sendable () -> Date

    private var saved: SavedTree?
    private var cachedIndex: TreeIndex?
    private var loadedFromDisk = false
    /// Dos refrescos a la vez son dos descargas del mismo árbol: el segundo
    /// espera al primero.
    private var refreshInFlight: Task<Void, Error>?

    init(api: APIClient, session: Session, store: TreeStore, clock: @Sendable @escaping () -> Date = Date.init) {
        self.api = api
        self.session = session
        self.store = store
        self.clock = clock
    }

    /// Lo guardado, sin tocar la red. `nil` si nunca se bajó nada.
    func index() async -> TreeIndex? {
        loadFromDiskIfNeeded()
        return cachedIndex
    }

    /// Baja el árbol si lo guardado tiene más de `maxAge` o no hay nada. Los
    /// errores —de red, de sesión— se tragan: sin red se usa lo guardado.
    func refreshIfNeeded(maxAge: Duration = .seconds(3600)) async {
        loadFromDiskIfNeeded()
        if let saved {
            let age = clock().timeIntervalSince(saved.downloadedAt)
            let limit = TimeInterval(maxAge.components.seconds) + TimeInterval(maxAge.components.attoseconds) / 1e18
            if age >= 0, age < limit { return }
        }
        try? await refreshNow()
    }

    /// `GET /categories` ahora mismo, se tenga lo que se tenga guardado.
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
        let roots: [TreeNode] = try await api.send(RequestBuilder.categories(), token: token)
        let newTree = SavedTree(roots: roots, downloadedAt: clock())
        // Si el disco falla el índice sirve igual en esta ejecución; la
        // siguiente vuelve a bajarlo.
        try? store.save(newTree)
        saved = newTree
        cachedIndex = TreeIndex(roots: roots)
        loadedFromDisk = true
    }

    private func loadFromDiskIfNeeded() {
        guard !loadedFromDisk else { return }
        loadedFromDisk = true
        // Un archivo corrupto cuenta como que no hay nada: se vuelve a bajar.
        guard let loaded = try? store.load() else { return }
        saved = loaded
        cachedIndex = TreeIndex(roots: loaded.roots)
    }
}
