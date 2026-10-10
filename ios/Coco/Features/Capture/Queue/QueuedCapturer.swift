import Foundation

/// The facade of the intents and the form: it enqueues (it is already safe),
/// tries to send within the budget and tells what happened. The notifications
/// are issued by the queue when it changes phase; here the only thing reported is what the queue never
/// gets to see: that it could not even be saved.
///
/// The budget is the one iOS gives the caller —10 s to an intent—, and it counts
/// from the call: whatever the disk takes is deducted from the sending.
struct QueuedCapturer: Capturer {
    let queue: CaptureQueue
    let notifier: Notifier

    func capture(_ body: CaptureBody, source: CaptureSource, photo: Data?, budget: Duration) async
        -> CaptureResult
    {
        let started = ContinuousClock.now
        let id = UUID()
        do {
            try await queue.enqueue(body, source: source, photo: photo, id: id)
        } catch QueueError.photosFull {
            let reason = L10n.Queue.errorNoPhotoSpace
            await notifier.captureFailed(reason: reason)
            return .failed(reason: reason)
        } catch {
            let reason = L10n.Queue.errorNotSaved
            await notifier.captureFailed(reason: reason)
            return .failed(reason: reason)
        }
        let remaining = budget - (ContinuousClock.now - started)
        if remaining > .zero { await queue.process(budget: remaining) }
        switch await queue.capture(id: id)?.phase {
        case .done(let r): return .sent(r)
        case .unconfirmed: return .unconfirmed
        case .failed(let reason): return .failed(reason: reason)
        default: return .queued(pending: await queue.pending())
        }
    }
}
