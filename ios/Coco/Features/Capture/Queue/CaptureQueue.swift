import Foundation

/// Lo que dejó una corrida de `process()`.
struct SendSummary: Equatable, Sendable {
    var sent: Int = 0
    var failed: Int = 0
    var pending: Int = 0
    var results: [SavedResult] = []
}

/// La columna vertebral: toda captura se escribe en disco ANTES de tocar la
/// red, y de ahí sale de una en una, FIFO, con reintentos. Nada se pierde:
/// lo que la API rechaza queda `.fallida` con su motivo, visible, no borrado.
final actor CaptureQueue {
    private let store: QueueStore
    private let sender: CaptureSender
    private let session: Session
    private let notifier: Notifier
    private let retryPolicy: Retry
    private let clock: @Sendable () -> Date
    private let spacing: Duration
    private let photoBytesLimit: Int
    private let shrinkPhoto: @Sendable (Data) -> Data

    /// Publica la cola entera tras cada transición; quien escucha saca de ahí
    /// el número de pendientes.
    nonisolated let changes: AsyncStream<[PendingCapture]>
    private let continuation: AsyncStream<[PendingCapture]>.Continuation

    private var inFlight: Task<SendSummary, Never>?
    private var lastSend: ContinuousClock.Instant?

    init(
        store: QueueStore,
        sender: CaptureSender,
        session: Session,
        notifier: Notifier,
        retryPolicy: Retry = .init(),
        clock: @Sendable @escaping () -> Date = Date.init,
        spacing: Duration = .milliseconds(300),
        photoBytesLimit: Int = 200 * 1024 * 1024,
        shrinkPhoto: @Sendable @escaping (Data) -> Data = { PhotoReducer.jpeg($0) }
    ) {
        self.store = store
        self.sender = sender
        self.session = session
        self.notifier = notifier
        self.retryPolicy = retryPolicy
        self.clock = clock
        self.spacing = spacing
        self.photoBytesLimit = photoBytesLimit
        self.shrinkPhoto = shrinkPhoto
        let (stream, continuation) = AsyncStream<[PendingCapture]>.makeStream(bufferingPolicy: .bufferingNewest(1))
        self.changes = stream
        self.continuation = continuation
    }

    // MARK: Entrada

    /// Idempotente por `id`: encolar dos veces la misma deja una. Persiste
    /// antes de devolver; si el disco falla, lanza y el que llama lo sabe.
    @discardableResult
    func enqueue(
        _ body: CaptureBody, source: CaptureSource, photo: Data?, id: UUID = UUID(), capturedAt: Date = .now
    ) async throws -> PendingCapture {
        if let existing = try store.all().first(where: { $0.id == id }) { return existing }
        var capture = PendingCapture(id: id, createdAt: capturedAt, source: source, body: body)
        if let photo {
            let jpeg = shrinkPhoto(photo)
            // Con el tope lleno no se escribe: una foto que no cabe no puede
            // dejar sin sitio al JSON de la captura siguiente.
            guard try store.photoBytes() + jpeg.count <= photoBytesLimit else { throw QueueError.photosFull }
            capture.photoPath = try store.savePhoto(jpeg, id: id)
        }
        try store.save(capture)
        await publish()
        return capture
    }

    // MARK: Envío

    /// Una sola corrida en vuelo: quien llega mientras otra corre espera su
    /// resultado. Respeta `nextAttempt` y para al agotar el presupuesto.
    @discardableResult
    func process(budget: Duration = .seconds(25)) async -> SendSummary {
        if let inFlight { return await inFlight.value }
        let task = Task { await self.runTask(budget: budget) }
        inFlight = task
        let summary = await task.value
        inFlight = nil
        return summary
    }

    private func runTask(budget: Duration) async -> SendSummary {
        let limit = ContinuousClock.now + budget
        var summary = SendSummary()
        var sentFromQueue = 0
        var attempted = Set<UUID>()

        while ContinuousClock.now < limit {
            let now = clock()
            guard let capture = ready(at: now).first(where: { !attempted.contains($0.id) }) else { break }
            attempted.insert(capture.id)
            await keepSpacing()
            let wasQueued = capture.attempts > 0
            let output = await send(capture)
            switch output {
            case .done(let r):
                summary.sent += 1
                summary.results.append(r)
                if wasQueued { sentFromQueue += 1 }
            case .failed:
                summary.failed += 1
            case .retry:
                continue
            case .noNetwork:
                break
            }
            // Sin red no tiene sentido seguir con las demás: cada una
            // esperaría su propio timeout para decir lo mismo.
            if case .noNetwork = output { break }
        }

        summary.pending = countPending()
        if sentFromQueue > 0 { await notifier.queueSent(count: sentFromQueue) }
        return summary
    }

    private enum SendOutcome {
        case done(SavedResult)
        case failed, retry, noNetwork
    }

    /// Fase 1 (texto) y fase 2 (foto) sobre una captura. Cada transición se
    /// escribe en disco antes de seguir, así un reinicio a mitad no duplica.
    private func send(_ original: PendingCapture) async -> SendOutcome {
        var capture = original
        if case .toSend = capture.phase {
            do {
                let response = try await withRefreshIfNeeded { try await self.sender.capture(capture.request) }
                let result = SavedResult(
                    transactionId: response.transaction.id,
                    summary: response.summary,
                    duplicate: response.duplicate,
                    merged: response.merged,
                    needsReview: response.transaction.needsReview,
                    finishedAt: clock()
                )
                capture.lastError = nil
                if capture.photoPath != nil {
                    capture.phase = .photoToUpload(transactionId: result.transactionId)
                    capture.textResult = result
                    try? store.save(capture)
                } else {
                    return await finish(&capture, with: result)
                }
            } catch {
                return await handleFailure(&capture, error: error)
            }
        }
        if case .photoToUpload(let transactionId) = capture.phase {
            let result =
                capture.textResult
                ?? SavedResult(
                    transactionId: transactionId, summary: "", duplicate: false, merged: false, needsReview: false,
                    finishedAt: clock())
            guard let path = capture.photoPath, let jpeg = try? store.photo(at: path) else {
                // Sin archivo no hay nada que subir: el texto ya está registrado.
                return await finish(&capture, with: result)
            }
            do {
                _ = try await withRefreshIfNeeded {
                    try await self.sender.uploadPhoto(jpeg, name: "\(capture.id.uuidString).jpg", to: transactionId)
                }
                return await finish(&capture, with: result)
            } catch {
                return await handleFailure(&capture, error: error)
            }
        }
        return .retry
    }

    /// Un 401 pide UNA renovación y reintenta de inmediato; si sigue en 401,
    /// la captura espera a que la persona vuelva a entrar.
    private func withRefreshIfNeeded<T>(_ operation: () async throws -> T) async throws -> T {
        do {
            return try await operation()
        } catch APIError.unauthenticated {
            do { try await session.refreshNow() } catch { throw APIError.unauthenticated }
            return try await operation()
        }
    }

    private func finish(_ capture: inout PendingCapture, with result: SavedResult) async -> SendOutcome {
        if let path = capture.photoPath {
            try? store.deletePhoto(at: path)
            capture.photoPath = nil
        }
        capture.phase = .done(result)
        capture.textResult = nil
        capture.lastError = nil
        try? store.save(capture)
        await notifier.captureSaved(result, source: capture.source)
        await publish()
        return .done(result)
    }

    private func handleFailure(_ capture: inout PendingCapture, error: Error) async -> SendOutcome {
        let api = APIError.from(error)
        let output: SendOutcome
        switch api {
        case .unauthenticated:
            // Sin crecer la espera: no es culpa de la red, es de la sesión.
            capture.phase = .awaitingSession
            capture.lastError = L10n.Queue.errorSessionExpired
            output = .retry
        case .rejected(_, _, let message):
            capture.phase = .failed(reason: message)
            capture.lastError = message
            await notifier.captureFailed(reason: message)
            output = .failed
        case .unreadableResponse:
            let reason = L10n.Queue.errorUnreadableResponse
            capture.phase = .failed(reason: reason)
            capture.lastError = reason
            await notifier.captureFailed(reason: reason)
            output = .failed
        case .noNetwork, .timedOut, .server:
            capture.attempts += 1
            capture.nextAttempt = clock().addingTimeInterval(
                Self.seconds(retryPolicy.delay(attempt: capture.attempts - 1)))
            capture.lastError = Self.describe(api)
            output = api.isNetworkError ? .noNetwork : .retry
        }
        try? store.save(capture)
        await publish()
        return output
    }

    private static func seconds(_ d: Duration) -> TimeInterval {
        Double(d.components.seconds) + Double(d.components.attoseconds) / 1e18
    }

    private static func describe(_ e: APIError) -> String {
        switch e {
        case .noNetwork: L10n.Queue.errorNoNetwork
        case .timedOut: L10n.Queue.errorTimedOut
        case .server(let status): L10n.Queue.errorServer(status)
        default: L10n.Queue.errorGeneric
        }
    }

    private func keepSpacing() async {
        if let last = lastSend {
            let elapsed = ContinuousClock.now - last
            if elapsed < spacing { try? await Task.sleep(for: spacing - elapsed) }
        }
        lastSend = .now
    }

    /// Lo que toca enviar ahora, en el orden en que se capturó.
    private func ready(at now: Date) -> [PendingCapture] {
        let all = (try? store.all()) ?? []
        return
            all
            .filter { c in
                switch c.phase {
                case .toSend, .photoToUpload: c.nextAttempt <= now
                default: false
                }
            }
            .sorted { $0.createdAt < $1.createdAt }
    }
}

// MARK: Acciones de la persona

extension CaptureQueue {

    func retryNow(id: UUID) async {
        guard var capture = search(id) else { return }
        switch capture.phase {
        case .failed, .awaitingSession: capture.phase = .toSend
        case .toSend, .photoToUpload: break
        case .done: return
        }
        capture.nextAttempt = .distantPast
        try? store.save(capture)
        await publish()
    }

    /// Solo lo que aún no llegó a la API: editar algo ya registrado sería
    /// mentir sobre lo que se envió.
    func edit(id: UUID, body: CaptureBody) async throws {
        guard var capture = search(id) else { throw QueueError.notFound(id) }
        switch capture.phase {
        case .failed, .toSend: break
        default: throw QueueError.notEditable(id)
        }
        capture.body = body
        capture.phase = .toSend
        capture.nextAttempt = .distantPast
        capture.lastError = nil
        try store.save(capture)
        await publish()
    }

    func discard(id: UUID) async throws {
        guard let capture = search(id) else { return }
        if let path = capture.photoPath { try? store.deletePhoto(at: path) }
        try store.delete(id: id)
        await publish()
    }

    /// Tras un login: lo que esperaba sesión vuelve a la fila.
    func sessionReturned() async {
        for var capture in (try? store.all()) ?? [] where capture.phase == .awaitingSession {
            capture.phase = .toSend
            capture.nextAttempt = .distantPast
            try? store.save(capture)
        }
        await publish()
    }

    func purge(doneOlderThan age: Duration = .seconds(30 * 86_400)) async {
        let now = clock()
        let seconds = TimeInterval(age.components.seconds)
        for capture in (try? store.all()) ?? [] {
            if case .done(let r) = capture.phase, now.timeIntervalSince(r.finishedAt) > seconds {
                try? store.delete(id: capture.id)
            }
        }
        await publish()
    }

    // MARK: Lectura

    func pending() async -> Int { countPending() }

    func all() async -> [PendingCapture] {
        ((try? store.all()) ?? []).sorted { $0.createdAt > $1.createdAt }
    }

    func capture(id: UUID) async -> PendingCapture? { search(id) }

    private func search(_ id: UUID) -> PendingCapture? {
        (try? store.all())?.first { $0.id == id }
    }

    private func countPending() -> Int {
        ((try? store.all()) ?? []).filter(\.isPending).count
    }

    private func publish() async {
        let all = ((try? store.all()) ?? []).sorted { $0.createdAt > $1.createdAt }
        continuation.yield(all)
        await notifier.setBadge(all.filter(\.isPending).count)
    }
}
