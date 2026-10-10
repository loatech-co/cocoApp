import Foundation
import os

/// What a run of `process()` left.
struct SendSummary: Equatable, Sendable {
    var sent: Int = 0
    var failed: Int = 0
    /// They arrived, but the response could not be read: «hecha, revisar».
    var unconfirmed: Int = 0
    var pending: Int = 0
    var results: [SavedResult] = []
}

/// What the captures screen needs to know about the queue: the captures,
/// how many files were set aside as unreadable and whether the disk is failing.
struct QueueSnapshot: Equatable, Sendable {
    /// From the newest to the oldest.
    var captures: [PendingCapture] = []
    var unreadable = 0
    var diskError = false
}

/// The disk step that failed, for the log: it names the operation and never
/// carries the content of the capture.
enum DiskStep {
    case savePhotoPhase, readPhoto, deleteSentPhoto, saveDone, saveFailure, saveRetry, deleteDiscardedPhoto
    case discard, saveSessionReturned, purge, countQuarantine, readQueue
}

extension CaptureQueue {
    static func seconds(_ d: Duration) -> TimeInterval {
        Double(d.components.seconds) + Double(d.components.attoseconds) / 1e18
    }

    /// The result of a 409 `duplicate`: the one from its text if it already had it (the
    /// duplicate was the photo); if there is no photo, one with no known transaction.
    /// `nil` if a photo is left with no transaction to attach it to: closing it
    /// as done would delete the receipt.
    static func alreadyRegistered(_ capture: PendingCapture, _ problem: APIProblem, at date: Date) -> SavedResult? {
        if let result = capture.textResult { return result }
        guard capture.photoPath == nil else { return nil }
        return SavedResult(
            transactionId: 0, summary: problem.detail, duplicate: true, merged: false, needsReview: false,
            finishedAt: date)
    }

    static func describe(_ e: APIError) -> String {
        switch e {
        case .noNetwork: L10n.Queue.errorNoNetwork
        case .timedOut: L10n.Queue.errorTimedOut
        case .server(let status): L10n.Queue.errorServer(status)
        default: L10n.Queue.errorGeneric
        }
    }

    static func value(of task: Task<SendSummary, Never>, within limit: Duration) async -> SendSummary? {
        let gate = Gate()
        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                gate.wait(continuation)
                Task { gate.open(await task.value) }
                Task {
                    try? await Task.sleep(for: limit)
                    gate.open(nil)
                }
            }
        } onCancel: {
            gate.open(nil)
        }
    }
}

/// A continuation that is resumed only once, whoever wins: the
/// result, the deadline or the cancellation.
private final class Gate: Sendable {
    private enum State: Sendable {
        case idle
        case waiting(CheckedContinuation<SendSummary?, Never>)
        case open
    }

    private let state = OSAllocatedUnfairLock<State>(initialState: .idle)

    func wait(_ continuation: CheckedContinuation<SendSummary?, Never>) {
        let alreadyOpen = state.withLock { state in
            if case .open = state { return true }
            state = .waiting(continuation)
            return false
        }
        if alreadyOpen { continuation.resume(returning: nil) }
    }

    func open(_ value: SendSummary?) {
        let continuation: CheckedContinuation<SendSummary?, Never>? = state.withLock { state in
            switch state {
            case .waiting(let c):
                state = .open
                return c
            case .idle:
                state = .open
                return nil
            case .open:
                return nil
            }
        }
        continuation?.resume(returning: value)
    }
}
