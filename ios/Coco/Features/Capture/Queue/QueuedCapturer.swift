import Foundation

/// La fachada de los intents y del formulario: encola (ya está a salvo),
/// intenta enviar dentro del presupuesto y cuenta qué pasó. Las notificaciones
/// las emite la cola al cambiar de fase; aquí solo se avisa lo que la cola no
/// llega a ver: que ni siquiera se pudo guardar.
struct QueuedCapturer: Capturer {
    let cola: CaptureQueue
    let notificador: Notifier

    init(cola: CaptureQueue, notificador: Notifier) {
        self.cola = cola
        self.notificador = notificador
    }

    func capturar(_ cuerpo: CaptureBody, origen: CaptureSource, foto: Data?, presupuesto: Duration) async
        -> CaptureResult
    {
        let id = UUID()
        do {
            try await cola.encolar(cuerpo, origen: origen, foto: foto, id: id)
        } catch QueueError.fotosLlenas {
            let motivo = "No hay espacio para más fotos pendientes. Captura sin foto o espera a que se envíen."
            await notificador.capturaFallida(motivo: motivo)
            return .fallida(motivo: motivo)
        } catch {
            let motivo = "No se pudo guardar la captura en el teléfono."
            await notificador.capturaFallida(motivo: motivo)
            return .fallida(motivo: motivo)
        }
        await cola.procesar(presupuesto: presupuesto)
        switch await cola.captura(id: id)?.fase {
        case .hecha(let r): return .enviada(r)
        case .fallida(let motivo): return .fallida(motivo: motivo)
        default: return .enCola(pendientes: await cola.pendientes())
        }
    }
}
