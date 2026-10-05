import Foundation
import Network
import Observation

/// Si hay red o no, según `NWPathMonitor`. Lo lee la interfaz (`hayRed`) y
/// lo escucha la cola (`cambios`) para reintentar en cuanto vuelve.
@Observable @MainActor
final class Conectividad {
    private(set) var hayRed: Bool = true
    nonisolated let cambios: AsyncStream<Bool>

    private let monitor: NWPathMonitor
    private let continuacion: AsyncStream<Bool>.Continuation
    private var empezado = false

    init(monitor: NWPathMonitor = .init()) {
        self.monitor = monitor
        let (flujo, continuacion) = AsyncStream<Bool>.makeStream()
        self.cambios = flujo
        self.continuacion = continuacion
    }

    func empezar() {
        guard !empezado else { return }
        empezado = true
        monitor.pathUpdateHandler = { [weak self] camino in
            let hay = camino.status == .satisfied
            Task { @MainActor in self?.actualizar(hay) }
        }
        monitor.start(queue: DispatchQueue(label: "co.loatech.coco.red"))
    }

    func parar() {
        guard empezado else { return }
        empezado = false
        monitor.cancel()
    }

    /// Solo publica cuando cambia: la cola no debe despertarse por repeticiones.
    func actualizar(_ hay: Bool) {
        guard hay != hayRed else { return }
        hayRed = hay
        continuacion.yield(hay)
    }
}
