import Foundation

/// La columna vertebral: toda captura se escribe en disco ANTES de tocar la
/// red, y de ahí sale de una en una, FIFO, con reintentos. Nada se pierde:
/// lo que la API rechaza queda `.failed` con su motivo, visible, no borrado; lo
/// que el disco no deja leer o escribir se registra y se enseña en Capturas.
final actor CaptureQueue {
    let store: QueueStore
    private let sender: CaptureSender
    private let session: Session
    private let notifier: Notifier
    private let retryPolicy: Retry
    let clock: @Sendable () -> Date
    private let spacing: Duration
    private let photoBytesLimit: Int
    private let shrinkPhoto: @Sendable (Data) -> Data

    /// Publica la cola entera tras cada transición; quien escucha saca de ahí
    /// el número de pendientes.
    nonisolated let changes: AsyncStream<QueueSnapshot>
    private let continuation: AsyncStream<QueueSnapshot>.Continuation

    private var inFlight: Task<SendSummary, Never>?
    private var lastSend: ContinuousClock.Instant?
    /// Lo último que se pudo leer: si el disco falla, la insignia no cae a 0.
    private var lastRead: [PendingCapture] = []
    /// Una lectura o escritura falló y ninguna escritura ha ido bien después.
    private var diskError = false

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
        let (stream, continuation) = AsyncStream<QueueSnapshot>.makeStream(bufferingPolicy: .bufferingNewest(1))
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

    /// Una sola corrida en vuelo. El presupuesto es un TOPE, no una pista: al
    /// vencer se cancela lo que esté en vuelo —también una petición a mitad— y
    /// la captura se queda en la cola tal como estaba en disco. Cancelar a
    /// quien llama hace lo mismo (`withTaskCancellationHandler`).
    ///
    /// Quien llega con otra corrida en marcha la espera, pero solo hasta SU
    /// presupuesto: un intent de 10 s no hereda los 25 s del primer plano.
    @discardableResult
    func process(budget: Duration = .seconds(25)) async -> SendSummary {
        if let inFlight {
            return await Self.value(of: inFlight, within: budget) ?? SendSummary(pending: countPending())
        }
        let run = Task { await self.runTask() }
        inFlight = run
        let deadline = Task {
            guard (try? await Task.sleep(for: budget)) != nil else { return }
            run.cancel()
        }
        let summary = await withTaskCancellationHandler {
            await run.value
        } onCancel: {
            run.cancel()
        }
        deadline.cancel()
        inFlight = nil
        return summary
    }

    private func runTask() async -> SendSummary {
        var summary = SendSummary()
        var sentFromQueue = 0
        var attempted = Set<UUID>()

        loop: while !Task.isCancelled {
            let now = clock()
            guard let capture = ready(at: now).first(where: { !attempted.contains($0.id) }) else { break }
            attempted.insert(capture.id)
            await keepSpacing()
            if Task.isCancelled { break }
            let wasQueued = capture.attempts > 0
            let output = await send(capture)
            switch output {
            case .done(let r):
                summary.sent += 1
                summary.results.append(r)
                if wasQueued { sentFromQueue += 1 }
            case .unconfirmed:
                summary.unconfirmed += 1
            case .failed:
                summary.failed += 1
            case .retry:
                continue
            case .noNetwork, .cancelled:
                // Sin red no tiene sentido seguir con las demás: cada una
                // esperaría su propio timeout para decir lo mismo. Cancelada,
                // la corrida termina aquí y lo demás espera a la siguiente.
                break loop
            }
        }

        summary.pending = countPending()
        if sentFromQueue > 0 { await notifier.queueSent(count: sentFromQueue) }
        return summary
    }

    private enum SendOutcome {
        case done(SavedResult)
        case failed, unconfirmed, retry, noNetwork, cancelled
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
                    persist(capture, step: .savePhotoPhase)
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
            let jpeg: Data
            do {
                guard let path = capture.photoPath else { return await finish(&capture, with: result) }
                jpeg = try store.photo(at: path)
            } catch {
                // Sin archivo no hay nada que subir: el texto ya está registrado.
                report(.readPhoto, error, visible: false)
                return await finish(&capture, with: result)
            }
            do {
                _ = try await withRefreshIfNeeded {
                    try await self.sender.uploadPhoto(jpeg, name: "\(capture.id.uuidString).jpg", to: transactionId)
                }
                return await finish(&capture, with: result)
            } catch {
                // Un 2xx ilegible al subir la foto: la foto llegó.
                if case .unreadableSuccess = APIError.from(error) { return await finish(&capture, with: result) }
                return await handleFailure(&capture, error: error)
            }
        }
        return .retry
    }

    /// Un 401 pide UNA renovación y reintenta de inmediato; si sigue en 401,
    /// la captura espera a que la persona vuelva a entrar. Cancelada a mitad
    /// de la renovación, es una cancelación y no una sesión caída.
    private func withRefreshIfNeeded<T>(_ operation: () async throws -> T) async throws -> T {
        do {
            return try await operation()
        } catch APIError.unauthenticated {
            do {
                try await session.refreshNow()
            } catch {
                throw Task.isCancelled ? APIError.cancelled : APIError.unauthenticated
            }
            return try await operation()
        }
    }

    private func finish(_ capture: inout PendingCapture, with result: SavedResult) async -> SendOutcome {
        if let path = capture.photoPath {
            do { try store.deletePhoto(at: path) } catch { report(.deleteSentPhoto, error, visible: false) }
            capture.photoPath = nil
        }
        capture.phase = .done(result)
        capture.textResult = nil
        capture.lastError = nil
        persist(capture, step: .saveDone)
        await notifier.captureSaved(result, source: capture.source)
        await publish()
        return .done(result)
    }

    private func handleFailure(_ capture: inout PendingCapture, error: Error) async -> SendOutcome {
        let api = APIError.from(error)
        let output: SendOutcome
        switch api {
        case .cancelled:
            // Ni intento ni error: la captura sigue en disco como estaba y la
            // próxima corrida la retoma.
            return .cancelled
        case .unauthenticated:
            // Sin crecer la espera: no es culpa de la red, es de la sesión.
            capture.phase = .awaitingSession
            capture.lastError = L10n.Queue.errorSessionExpired
            output = .retry
        case .sessionRevoked:
            // Renovar no sirve: la sesión se cierra aquí y la captura espera
            // a que la persona vuelva a entrar.
            await session.discard()
            capture.phase = .awaitingSession
            capture.lastError = L10n.Problem.sessionRevoked
            output = .retry
        case .duplicate(let problem):
            // Ya estaba registrada (un reenvío): cuenta como hecha.
            return await finish(&capture, with: Self.alreadyRegistered(capture, problem, at: clock()))
        case .rejected(let problem):
            let message = problem.userMessage()
            capture.phase = .failed(reason: message)
            capture.lastError = message
            await notifier.captureFailed(reason: message)
            output = .failed
        case .unreadableSuccess(let status):
            // El servidor la creó: reintentarla dependería de la idempotencia
            // para no duplicar el gasto. Queda «hecha, revisar».
            AppLog.queue.warning("Respuesta \(status, privacy: .public) ilegible: captura sin confirmar")
            capture.phase = .unconfirmed(at: clock())
            capture.lastError = nil
            output = .unconfirmed
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
        persist(capture, step: .saveFailure)
        await publish()
        return output
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
        load()
            .filter { c in
                switch c.phase {
                case .toSend, .photoToUpload: c.nextAttempt <= now
                default: false
                }
            }
            .sorted { $0.createdAt < $1.createdAt }
    }
}

// MARK: Disco y lectura

// Lo comparten el envío y las acciones de la persona
// (`CaptureQueue+Actions.swift`); fuera de la cola no se llama.
extension CaptureQueue {
    func search(_ id: UUID) -> PendingCapture? {
        load().first { $0.id == id }
    }

    func countPending() -> Int {
        load().filter(\.isPending).count
    }

    func makeSnapshot() -> QueueSnapshot {
        let captures = load().sorted { $0.createdAt > $1.createdAt }
        var unreadable = 0
        do { unreadable = try store.quarantined() } catch { report(.countQuarantine, error) }
        return QueueSnapshot(captures: captures, unreadable: unreadable, diskError: diskError)
    }

    func publish() async {
        let snapshot = makeSnapshot()
        continuation.yield(snapshot)
        await notifier.setBadge(snapshot.captures.filter(\.isPending).count)
    }

    // MARK: Disco

    /// Lo que hay en disco; si no se deja leer, lo último que se leyó —y el
    /// fallo queda registrado y a la vista—, no una cola vacía.
    @discardableResult
    func load() -> [PendingCapture] {
        do {
            lastRead = try store.all()
        } catch {
            report(.readQueue, error)
        }
        return lastRead
    }

    func persist(_ capture: PendingCapture, step: DiskStep) {
        do {
            try store.save(capture)
            diskError = false
        } catch {
            report(step, error)
        }
    }

    /// Qué paso falló y el tipo de error, nunca el contenido de la captura.
    /// `visible`: si Capturas tiene que avisar. Una foto que sobra en disco no
    /// cambia nada de lo que la persona ve.
    func report(_ step: DiskStep, _ error: Error, visible: Bool = true) {
        if visible { diskError = true }
        let ns = error as NSError
        let what = String(describing: step)
        AppLog.queue.error("No se pudo: \(what, privacy: .public) \(ns.domain, privacy: .public) \(ns.code)")
    }

    /// Espera a `task` como mucho `limit`, sin cancelarla: devuelve nil si
    /// vence el plazo o si se cancela a quien espera. La corrida sigue y lo que
    /// consiga queda en disco.
}
