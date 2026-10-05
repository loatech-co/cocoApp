import Foundation

/// Mantiene el árbol del teléfono al día con `GET /categories` y sirve el
/// índice a quien busque. Quién lo llama (arranque, primer plano, login,
/// captura enviada) es cosa de la app; aquí solo se decide si hace falta.
final actor TreeSynchronizer {
    private let api: APIClient
    private let sesion: Session
    private let almacen: TreeStore
    private let reloj: @Sendable () -> Date

    private var guardado: SavedTree?
    private var indiceEnMemoria: TreeIndex?
    private var cargadoDelDisco = false
    /// Dos refrescos a la vez son dos descargas del mismo árbol: el segundo
    /// espera al primero.
    private var refrescoEnVuelo: Task<Void, Error>?

    init(api: APIClient, sesion: Session, almacen: TreeStore, reloj: @Sendable @escaping () -> Date = Date.init) {
        self.api = api
        self.sesion = sesion
        self.almacen = almacen
        self.reloj = reloj
    }

    /// Lo guardado, sin tocar la red. `nil` si nunca se bajó nada.
    func indice() async -> TreeIndex? {
        cargarDelDiscoSiHaceFalta()
        return indiceEnMemoria
    }

    /// Baja el árbol si lo guardado tiene más de `maxEdad` o no hay nada. Los
    /// errores —de red, de sesión— se tragan: sin red se usa lo guardado.
    func refrescarSiHaceFalta(maxEdad: Duration = .seconds(3600)) async {
        cargarDelDiscoSiHaceFalta()
        if let guardado {
            let edad = reloj().timeIntervalSince(guardado.descargadoEn)
            let tope = TimeInterval(maxEdad.components.seconds) + TimeInterval(maxEdad.components.attoseconds) / 1e18
            if edad >= 0, edad < tope { return }
        }
        try? await refrescarAhora()
    }

    /// `GET /categories` ahora mismo, se tenga lo que se tenga guardado.
    func refrescarAhora() async throws {
        if let enVuelo = refrescoEnVuelo {
            return try await enVuelo.value
        }
        let tarea = Task { try await self.descargar() }
        refrescoEnVuelo = tarea
        defer { refrescoEnVuelo = nil }
        try await tarea.value
    }

    private func descargar() async throws {
        let token = try await sesion.accessTokenVigente()
        let raices: [TreeNode] = try await api.enviar(RequestBuilder.categorias(), token: token)
        let nuevo = SavedTree(raices: raices, descargadoEn: reloj())
        // Si el disco falla el índice sirve igual en esta ejecución; la
        // siguiente vuelve a bajarlo.
        try? almacen.guardar(nuevo)
        guardado = nuevo
        indiceEnMemoria = TreeIndex(raices: raices)
        cargadoDelDisco = true
    }

    private func cargarDelDiscoSiHaceFalta() {
        guard !cargadoDelDisco else { return }
        cargadoDelDisco = true
        // Un archivo corrupto cuenta como que no hay nada: se vuelve a bajar.
        guard let leido = try? almacen.cargar() else { return }
        guardado = leido
        indiceEnMemoria = TreeIndex(raices: leido.raices)
    }
}
