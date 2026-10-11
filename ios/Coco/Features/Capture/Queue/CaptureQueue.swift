import Foundation

/// The backbone: every capture is written to disk BEFORE touching the
/// network, and from there it goes out one at a time, FIFO, with retries. Nothing is lost:
/// what the API rejects stays `.failed` with its reason, visible, not deleted; what
/// the disk does not allow to read or write is logged and shown in Captures.
final actor CaptureQueue {
    let store: QueueStore
    private let sender: CaptureSender
    let session: Session
    let notifier: Notifier
    let retryPolicy: Retry
    let clock: @Sendable () -> Date
    private let spacing: Duration
    private let photoBytesLimit: Int
    private let shrinkPhoto: @Sendable (Data) -> Data

    /// Publishes the whole queue after each transition; whoever listens takes from there
    /// the number of pending items.
    nonisolated let changes: AsyncStream<QueueSnapshot>
    let continuation: AsyncStream<QueueSnapshot>.Continuation

    private var inFlight: Task<SendSummary, Never>?
    private var lastSend: ContinuousClock.Instant?
    /// The last thing that could be read: if the disk fails, the badge does not drop to 0.
    var lastRead: [PendingCapture] = []
    /// A read or write failed and no write has gone well since.
    var diskError = false

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

    // MARK: Input

    /// Idempotent by `id`: enqueuing the same one twice leaves one. It persists
    /// before returning; if the disk fails, it throws and the caller knows.
    @discardableResult
    func enqueue(
        _ body: CaptureBody, source: CaptureSource, photo: Data?, id: UUID = UUID(), capturedAt: Date = .now
    ) async throws -> PendingCapture {
        if let existing = try store.all().first(where: { $0.id == id }) { return existing }
        var capture = PendingCapture(id: id, createdAt: capturedAt, source: source, body: body)
        if let photo {
            let jpeg = shrinkPhoto(photo)
            // With the cap full nothing is written: a photo that does not fit cannot
            // leave the next capture's JSON without room.
            guard try store.photoBytes() + jpeg.count <= photoBytesLimit else { throw QueueError.photosFull }
            capture.photoPath = try store.savePhoto(jpeg, id: id)
        }
        try store.save(capture)
        await publish()
        return capture
    }

    // MARK: Sending

    /// A single run in flight. The budget is a CAP, not a hint: when it
    /// runs out whatever is in flight is cancelled —a request halfway, too— and
    /// the capture stays in the queue just as it was on disk. Cancelling
    /// the caller does the same (`withTaskCancellationHandler`).
    ///
    /// Whoever arrives with another run under way waits for it, but only up to THEIR
    /// budget: a 10 s intent does not inherit the 25 s of the foreground.
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
                // Without network there is no point going on with the rest: each one
                // would wait for its own timeout to say the same thing. Cancelled,
                // the run ends here and the rest waits for the next one.
                break loop
            }
        }

        summary.pending = countPending()
        if sentFromQueue > 0 { await notifier.queueSent(count: sentFromQueue) }
        return summary
    }

    enum SendOutcome {
        case done(SavedResult)
        case failed, unconfirmed, retry, noNetwork, cancelled
    }

    /// Phase 1 (text) and phase 2 (photo) on a capture. Each transition is
    /// written to disk before going on, so a restart halfway does not duplicate.
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
                // Without a file there is nothing to upload: the text is already recorded.
                report(.readPhoto, error, visible: false)
                return await finish(&capture, with: result)
            }
            do {
                _ = try await withRefreshIfNeeded {
                    try await self.sender.uploadPhoto(jpeg, name: "\(capture.id.uuidString).jpg", to: transactionId)
                }
                return await finish(&capture, with: result)
            } catch {
                // An unreadable 2xx when uploading the photo: the photo arrived.
                if case .unreadableSuccess = APIError.from(error) { return await finish(&capture, with: result) }
                return await handleFailure(&capture, error: error)
            }
        }
        return .retry
    }

    /// A 401 asks for ONE refresh and retries right away; if it is still 401,
    /// the capture waits for the person to sign in again. Cancelled halfway
    /// through the refresh, it is a cancellation and not a dropped session.
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

    private func keepSpacing() async {
        if let last = lastSend {
            let elapsed = ContinuousClock.now - last
            if elapsed < spacing { try? await Task.sleep(for: spacing - elapsed) }
        }
        lastSend = .now
    }

    /// What is due to be sent now, in the order it was captured.
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
