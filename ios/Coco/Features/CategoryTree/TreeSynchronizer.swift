import Foundation

/// Mantiene el árbol del teléfono al día con `GET /categories` y sirve el
/// índice a quien busque. Quién lo llama (arranque, primer plano, login,
/// captura enviada) es cosa de la app; aquí solo se decide si hace falta.
final actor TreeSynchronizer {
    private let api: APIClient
    private let session: Session
    private let store: TreeStore
    private let clock: @Sendable () -> Date

    private var guardado: SavedTree?
    private var indiceEnMemoria: TreeIndex?
    private var cargadoDelDisco = false
    /// Dos refrescos a la vez son dos descargas del mismo árbol: el segundo
    /// espera al primero.
    private var refrescoEnVuelo: Task<Void, Error>?

    init(api: APIClient, session: Session, store: TreeStore, clock: @Sendable @escaping () -> Date = Date.init) {
        self.api = api
        self.session = session
        self.store = store
        self.clock = clock
    }

    /// Lo guardado, sin tocar la red. `nil` si nunca se bajó nada.
    func index() async -> TreeIndex? {
        cargarDelDiscoSiHaceFalta()
        return indiceEnMemoria
    }

    /// Baja el árbol si lo guardado tiene más de `maxEdad` o no hay nada. Los
    /// errores —de red, de sesión— se tragan: sin red se usa lo guardado.
    func refreshIfNeeded(maxEdad: Duration = .seconds(3600)) async {
        cargarDelDiscoSiHaceFalta()
        if let guardado {
            let age = clock().timeIntervalSince(guardado.descargadoEn)
            let limit = TimeInterval(maxEdad.components.seconds) + TimeInterval(maxEdad.components.attoseconds) / 1e18
            if age >= 0, age < limit { return }
        }
        try? await refrescarAhora()
    }

    /// `GET /categories` ahora mismo, se tenga lo que se tenga guardado.
    func refrescarAhora() async throws {
        if let inFlight = refrescoEnVuelo {
            return try await inFlight.value
        }
        let task = Task { try await self.descargar() }
        refrescoEnVuelo = task
        defer { refrescoEnVuelo = nil }
        try await task.value
    }

    private func descargar() async throws {
        let token = try await session.validAccessToken()
        let roots: [TreeNode] = try await api.send(RequestBuilder.categories(), token: token)
        let nuevo = SavedTree(roots: roots, descargadoEn: clock())
        // Si el disco falla el índice sirve igual en esta ejecución; la
        // siguiente vuelve a bajarlo.
        try? store.save(nuevo)
        guardado = nuevo
        indiceEnMemoria = TreeIndex(roots: roots)
        cargadoDelDisco = true
    }

    private func cargarDelDiscoSiHaceFalta() {
        guard !cargadoDelDisco else { return }
        cargadoDelDisco = true
        // Un archivo corrupto cuenta como que no hay nada: se vuelve a bajar.
        guard let leido = try? store.load() else { return }
        guardado = leido
        indiceEnMemoria = TreeIndex(roots: leido.roots)
    }
}
