import Foundation

/// Lo que dejó una corrida de `process()`.
struct SendSummary: Equatable, Sendable {
    var sent: Int = 0
    var fallidas: Int = 0
    var pending: Int = 0
    var resultados: [SavedResult] = []
}

/// La columna vertebral: toda captura se escribe en disco ANTES de tocar la
/// red, y de ahí sale de una en una, FIFO, con reintentos. Nada se pierde:
/// lo que la API rechaza queda `.fallida` con su motivo, visible, no borrado.
final actor CaptureQueue {
    private let almacen: QueueStore
    private let enviador: CaptureSender
    private let session: Session
    private let notifier: Notifier
    private let reintento: Retry
    private let reloj: @Sendable () -> Date
    private let separacion: Duration
    private let topeDeFotosBytes: Int
    private let encogerFoto: @Sendable (Data) -> Data

    /// Publica la cola entera tras cada transición; quien escucha saca de ahí
    /// el número de pendientes.
    nonisolated let changes: AsyncStream<[PendingCapture]>
    private let continuation: AsyncStream<[PendingCapture]>.Continuation

    private var enVuelo: Task<SendSummary, Never>?
    private var ultimoEnvio: ContinuousClock.Instant?

    init(
        almacen: QueueStore,
        enviador: CaptureSender,
        session: Session,
        notifier: Notifier,
        reintento: Retry = .init(),
        reloj: @Sendable @escaping () -> Date = Date.init,
        separacion: Duration = .milliseconds(300),
        topeDeFotosBytes: Int = 200 * 1024 * 1024,
        encogerFoto: @Sendable @escaping (Data) -> Data = { PhotoReducer.jpeg($0) }
    ) {
        self.almacen = almacen
        self.enviador = enviador
        self.session = session
        self.notifier = notifier
        self.reintento = reintento
        self.reloj = reloj
        self.separacion = separacion
        self.topeDeFotosBytes = topeDeFotosBytes
        self.encogerFoto = encogerFoto
        let (stream, continuation) = AsyncStream<[PendingCapture]>.makeStream(bufferingPolicy: .bufferingNewest(1))
        self.changes = stream
        self.continuation = continuation
    }

    // MARK: Entrada

    /// Idempotente por `id`: encolar dos veces la misma deja una. Persiste
    /// antes de devolver; si el disco falla, lanza y el que llama lo sabe.
    @discardableResult
    func encolar(
        _ body: CaptureBody, source: CaptureSource, photo: Data?, id: UUID = UUID(), capturadaEn: Date = .now
    ) async throws -> PendingCapture {
        if let existente = try almacen.all().first(where: { $0.id == id }) { return existente }
        var capture = PendingCapture(id: id, creadaEn: capturadaEn, source: source, body: body)
        if let photo {
            let jpeg = encogerFoto(photo)
            // Con el tope lleno no se escribe: una foto que no cabe no puede
            // dejar sin sitio al JSON de la captura siguiente.
            guard try almacen.photoBytes() + jpeg.count <= topeDeFotosBytes else { throw QueueError.photosFull }
            capture.fotoRelativa = try almacen.savePhoto(jpeg, id: id)
        }
        try almacen.save(capture)
        await publicar()
        return capture
    }

    // MARK: Envío

    /// Una sola corrida en vuelo: quien llega mientras otra corre espera su
    /// resultado. Respeta `proximoIntento` y para al agotar el presupuesto.
    @discardableResult
    func process(budget: Duration = .seconds(25)) async -> SendSummary {
        if let enVuelo { return await enVuelo.value }
        let task = Task { await self.runTask(budget: budget) }
        enVuelo = task
        let summary = await task.value
        enVuelo = nil
        return summary
    }

    private func runTask(budget: Duration) async -> SendSummary {
        let limite = ContinuousClock.now + budget
        var summary = SendSummary()
        var enviadasQueEstabanEnCola = 0
        var yaIntentadas = Set<UUID>()

        while ContinuousClock.now < limite {
            let now = reloj()
            guard let capture = listas(at: now).first(where: { !yaIntentadas.contains($0.id) }) else { break }
            yaIntentadas.insert(capture.id)
            await respetarSeparacion()
            let estabaEnCola = capture.intentos > 0
            let output = await send(capture)
            switch output {
            case .hecha(let r):
                summary.sent += 1
                summary.resultados.append(r)
                if estabaEnCola { enviadasQueEstabanEnCola += 1 }
            case .failed:
                summary.fallidas += 1
            case .retry:
                continue
            case .noNetwork:
                break
            }
            // Sin red no tiene sentido seguir con las demás: cada una
            // esperaría su propio timeout para decir lo mismo.
            if case .noNetwork = output { break }
        }

        summary.pending = contarPendientes()
        if enviadasQueEstabanEnCola > 0 { await notifier.queueSent(count: enviadasQueEstabanEnCola) }
        return summary
    }

    private enum SendOutcome {
        case hecha(SavedResult)
        case failed, retry, noNetwork
    }

    /// Fase 1 (texto) y fase 2 (foto) sobre una captura. Cada transición se
    /// escribe en disco antes de seguir, así un reinicio a mitad no duplica.
    private func send(_ original: PendingCapture) async -> SendOutcome {
        var capture = original
        if case .porEnviar = capture.fase {
            do {
                let response = try await conRenovacionSiHaceFalta { try await self.enviador.capture(capture.request) }
                let result = SavedResult(
                    transactionId: response.transaction.id,
                    summary: response.summary,
                    duplicate: response.duplicate,
                    merged: response.merged,
                    needsReview: response.transaction.needsReview,
                    finishedAt: reloj()
                )
                capture.ultimoError = nil
                if capture.fotoRelativa != nil {
                    capture.fase = .porSubirFoto(transactionId: result.transactionId)
                    capture.resultadoDeTexto = result
                    try? almacen.save(capture)
                } else {
                    return await terminar(&capture, con: result)
                }
            } catch {
                return await failure(&capture, error: error)
            }
        }
        if case .porSubirFoto(let transactionId) = capture.fase {
            let result =
                capture.resultadoDeTexto
                ?? SavedResult(
                    transactionId: transactionId, summary: "", duplicate: false, merged: false, needsReview: false,
                    finishedAt: reloj())
            guard let path = capture.fotoRelativa, let jpeg = try? almacen.photo(at: path) else {
                // Sin archivo no hay nada que subir: el texto ya está registrado.
                return await terminar(&capture, con: result)
            }
            do {
                _ = try await conRenovacionSiHaceFalta {
                    try await self.enviador.uploadPhoto(jpeg, name: "\(capture.id.uuidString).jpg", to: transactionId)
                }
                return await terminar(&capture, con: result)
            } catch {
                return await failure(&capture, error: error)
            }
        }
        return .retry
    }

    /// Un 401 pide UNA renovación y reintenta de inmediato; si sigue en 401,
    /// la captura espera a que la persona vuelva a entrar.
    private func conRenovacionSiHaceFalta<T>(_ operacion: () async throws -> T) async throws -> T {
        do {
            return try await operacion()
        } catch APIError.unauthenticated {
            do { try await session.refreshNow() } catch { throw APIError.unauthenticated }
            return try await operacion()
        }
    }

    private func terminar(_ capture: inout PendingCapture, con result: SavedResult) async -> SendOutcome {
        if let path = capture.fotoRelativa {
            try? almacen.deletePhoto(at: path)
            capture.fotoRelativa = nil
        }
        capture.fase = .hecha(result)
        capture.resultadoDeTexto = nil
        capture.ultimoError = nil
        try? almacen.save(capture)
        await notifier.captureSaved(result, source: capture.source)
        await publicar()
        return .hecha(result)
    }

    private func failure(_ capture: inout PendingCapture, error: Error) async -> SendOutcome {
        let api = APIError.from(error)
        let output: SendOutcome
        switch api {
        case .unauthenticated:
            // Sin crecer la espera: no es culpa de la red, es de la sesión.
            capture.fase = .esperandoSesion
            capture.ultimoError = "La sesión expiró. Vuelve a entrar."
            output = .retry
        case .rejected(_, _, let message):
            capture.fase = .failed(reason: message)
            capture.ultimoError = message
            await notifier.captureFailed(reason: message)
            output = .failed
        case .unreadableResponse:
            let reason = "La API contestó algo que no se entiende."
            capture.fase = .failed(reason: reason)
            capture.ultimoError = reason
            await notifier.captureFailed(reason: reason)
            output = .failed
        case .noNetwork, .timedOut, .server:
            capture.intentos += 1
            capture.proximoIntento = reloj().addingTimeInterval(
                Self.segundos(reintento.espera(intento: capture.intentos - 1)))
            capture.ultimoError = Self.describir(api)
            output = api.isNetworkError ? .noNetwork : .retry
        }
        try? almacen.save(capture)
        await publicar()
        return output
    }

    private static func segundos(_ d: Duration) -> TimeInterval {
        Double(d.components.seconds) + Double(d.components.attoseconds) / 1e18
    }

    private static func describir(_ e: APIError) -> String {
        switch e {
        case .noNetwork: "Sin conexión"
        case .timedOut: "La API tardó demasiado"
        case .server(let status): "La API no pudo ahora (\(status))"
        default: "Error"
        }
    }

    private func respetarSeparacion() async {
        if let last = ultimoEnvio {
            let transcurrido = ContinuousClock.now - last
            if transcurrido < separacion { try? await Task.sleep(for: separacion - transcurrido) }
        }
        ultimoEnvio = .now
    }

    /// Lo que toca enviar ahora, en el orden en que se capturó.
    private func listas(at now: Date) -> [PendingCapture] {
        let all = (try? almacen.all()) ?? []
        return
            all
            .filter { c in
                switch c.fase {
                case .porEnviar, .porSubirFoto: c.proximoIntento <= now
                default: false
                }
            }
            .sorted { $0.creadaEn < $1.creadaEn }
    }
}

// MARK: Acciones de la persona

extension CaptureQueue {

    func reintentarAhora(id: UUID) async {
        guard var capture = search(id) else { return }
        switch capture.fase {
        case .failed, .esperandoSesion: capture.fase = .porEnviar
        case .porEnviar, .porSubirFoto: break
        case .hecha: return
        }
        capture.proximoIntento = .distantPast
        try? almacen.save(capture)
        await publicar()
    }

    /// Solo lo que aún no llegó a la API: editar algo ya registrado sería
    /// mentir sobre lo que se envió.
    func editar(id: UUID, body: CaptureBody) async throws {
        guard var capture = search(id) else { throw QueueError.notFound(id) }
        switch capture.fase {
        case .failed, .porEnviar: break
        default: throw QueueError.notEditable(id)
        }
        capture.body = body
        capture.fase = .porEnviar
        capture.proximoIntento = .distantPast
        capture.ultimoError = nil
        try almacen.save(capture)
        await publicar()
    }

    func discard(id: UUID) async throws {
        guard let capture = search(id) else { return }
        if let path = capture.fotoRelativa { try? almacen.deletePhoto(at: path) }
        try almacen.delete(id: id)
        await publicar()
    }

    /// Tras un login: lo que esperaba sesión vuelve a la fila.
    func sesionVolvio() async {
        for var capture in (try? almacen.all()) ?? [] where capture.fase == .esperandoSesion {
            capture.fase = .porEnviar
            capture.proximoIntento = .distantPast
            try? almacen.save(capture)
        }
        await publicar()
    }

    func purgar(hechasMasViejasQue edad: Duration = .seconds(30 * 86_400)) async {
        let now = reloj()
        let segundos = TimeInterval(edad.components.seconds)
        for capture in (try? almacen.all()) ?? [] {
            if case .hecha(let r) = capture.fase, now.timeIntervalSince(r.finishedAt) > segundos {
                try? almacen.delete(id: capture.id)
            }
        }
        await publicar()
    }

    // MARK: Lectura

    func pending() async -> Int { contarPendientes() }

    func all() async -> [PendingCapture] {
        ((try? almacen.all()) ?? []).sorted { $0.creadaEn > $1.creadaEn }
    }

    func capture(id: UUID) async -> PendingCapture? { search(id) }

    private func search(_ id: UUID) -> PendingCapture? {
        (try? almacen.all())?.first { $0.id == id }
    }

    private func contarPendientes() -> Int {
        ((try? almacen.all()) ?? []).filter(\.estaPendiente).count
    }

    private func publicar() async {
        let all = ((try? almacen.all()) ?? []).sorted { $0.creadaEn > $1.creadaEn }
        continuation.yield(all)
        await notifier.setBadge(all.filter(\.estaPendiente).count)
    }
}
