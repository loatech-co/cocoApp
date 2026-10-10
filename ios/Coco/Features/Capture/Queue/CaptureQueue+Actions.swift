import Foundation

// MARK: The person's actions

extension CaptureQueue {

    func retryNow(id: UUID) async {
        guard var capture = search(id) else { return }
        switch capture.phase {
        case .failed, .awaitingSession: capture.phase = .toSend
        case .toSend, .photoToUpload: break
        // An unconfirmed one already arrived: it is reviewed, not repeated.
        case .done, .unconfirmed: return
        }
        capture.nextAttempt = .distantPast
        persist(capture, step: .saveRetry)
        await publish()
    }

    /// Only what has not reached the API yet: editing something already recorded would be
    /// lying about what was sent.
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
        if let path = capture.photoPath {
            do {
                try store.deletePhoto(at: path)
            } catch {
                report(.deleteDiscardedPhoto, error, visible: false)
            }
        }
        do {
            try store.delete(id: id)
        } catch {
            report(.discard, error)
            await publish()
            throw error
        }
        await publish()
    }

    /// After a login: what was waiting for a session goes back to the line.
    func sessionReturned() async {
        for var capture in load() where capture.phase == .awaitingSession {
            capture.phase = .toSend
            capture.nextAttempt = .distantPast
            persist(capture, step: .saveSessionReturned)
        }
        await publish()
    }

    /// The done ones older than `age`. Not the unconfirmed ones: those are removed by
    /// the person once they have reviewed them.
    func purge(doneOlderThan age: Duration = .seconds(30 * 86_400)) async {
        let now = clock()
        let seconds = TimeInterval(age.components.seconds)
        for capture in load() {
            if case .done(let r) = capture.phase, now.timeIntervalSince(r.finishedAt) > seconds {
                do { try store.delete(id: capture.id) } catch { report(.purge, error) }
            }
        }
        await publish()
    }

    // MARK: Reading

    func pending() async -> Int { countPending() }

    func all() async -> [PendingCapture] {
        load().sorted { $0.createdAt > $1.createdAt }
    }

    func snapshot() async -> QueueSnapshot { makeSnapshot() }

    func capture(id: UUID) async -> PendingCapture? { search(id) }

}
