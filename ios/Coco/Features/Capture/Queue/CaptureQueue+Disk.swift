import Foundation

// MARK: Disk and reading

// Shared by sending and the person's actions
// (`CaptureQueue+Actions.swift`); it is not called from outside the queue.
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

    // MARK: Disk

    /// What is on disk; if it cannot be read, the last thing that was read —and the
    /// failure stays logged and in sight—, not an empty queue.
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

    /// Which step failed and the error type, never the content of the capture.
    /// `visible`: whether Captures has to warn. A photo left over on disk does not
    /// change anything the person sees.
    func report(_ step: DiskStep, _ error: Error, visible: Bool = true) {
        if visible { diskError = true }
        let ns = error as NSError
        let what = String(describing: step)
        AppLog.queue.error("Failed: \(what, privacy: .public) \(ns.domain, privacy: .public) \(ns.code)")
    }
}
