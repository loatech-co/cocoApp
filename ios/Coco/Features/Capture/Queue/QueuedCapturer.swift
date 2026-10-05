import Foundation

/// La fachada de los intents y del formulario: encola (ya está a salvo),
/// intenta enviar dentro del presupuesto y cuenta qué pasó. Las notificaciones
/// las emite la cola al cambiar de fase; aquí solo se avisa lo que la cola no
/// llega a ver: que ni siquiera se pudo guardar.
struct QueuedCapturer: Capturer {
    let queue: CaptureQueue
    let notifier: Notifier

    func capture(_ body: CaptureBody, source: CaptureSource, photo: Data?, budget: Duration) async
        -> CaptureResult
    {
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
        await queue.process(budget: budget)
        switch await queue.capture(id: id)?.phase {
        case .done(let r): return .sent(r)
        case .failed(let reason): return .failed(reason: reason)
        default: return .queued(pending: await queue.pending())
        }
    }
}
