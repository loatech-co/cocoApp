import Foundation
import os

/// Lo que dejó una corrida de `process()`.
struct SendSummary: Equatable, Sendable {
    var sent: Int = 0
    var failed: Int = 0
    /// Llegaron, pero la respuesta no se pudo leer: «hecha, revisar».
    var unconfirmed: Int = 0
    var pending: Int = 0
    var results: [SavedResult] = []
}

/// Lo que la pantalla de capturas necesita saber de la cola: las capturas,
/// cuántos archivos se apartaron por ilegibles y si el disco está fallando.
struct QueueSnapshot: Equatable, Sendable {
    /// De la más nueva a la más vieja.
    var captures: [PendingCapture] = []
    var unreadable = 0
    var diskError = false
}

/// El paso de disco que falló, para el registro: nombra la operación y nunca
/// lleva el contenido de la captura.
enum DiskStep {
    case savePhotoPhase, readPhoto, deleteSentPhoto, saveDone, saveFailure, saveRetry, deleteDiscardedPhoto
    case discard, saveSessionReturned, purge, countQuarantine, readQueue
}

extension CaptureQueue {
    static func seconds(_ d: Duration) -> TimeInterval {
        Double(d.components.seconds) + Double(d.components.attoseconds) / 1e18
    }

    /// El resultado de un 409 `duplicate`: el de su texto si ya lo tenía (el
    /// duplicado fue la foto); si no hay foto, uno sin transacción conocida.
    /// `nil` si queda una foto sin movimiento al que adjuntarla: cerrarla
    /// como hecha borraría el recibo.
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

/// Una continuación que se reanuda una sola vez, gane quien gane: el
/// resultado, el plazo o la cancelación.
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
