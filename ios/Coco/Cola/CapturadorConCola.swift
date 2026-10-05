import Foundation

/// La fachada de los intents y del formulario: encola (ya está a salvo),
/// intenta enviar dentro del presupuesto y cuenta qué pasó. Las notificaciones
/// las emite la cola al cambiar de fase; aquí solo se avisa lo que la cola no
/// llega a ver: que ni siquiera se pudo guardar.
struct CapturadorConCola: Capturador {
    let cola: ColaDeCapturas
    let notificador: Notificador

    init(cola: ColaDeCapturas, notificador: Notificador) {
        self.cola = cola
        self.notificador = notificador
    }

    func capturar(_ cuerpo: CuerpoDeCaptura, origen: OrigenDeCaptura, foto: Data?, presupuesto: Duration) async -> ResultadoDeCaptura {
        let id = UUID()
        do {
            try await cola.encolar(cuerpo, origen: origen, foto: foto, id: id)
        } catch ErrorDeCola.fotosLlenas {
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
