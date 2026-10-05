import Foundation
import Network
import Observation

/// Si hay red o no, según `NWPathMonitor`. Lo lee la interfaz (`isOnline`) y
/// lo escucha la cola (`cambios`) para reintentar en cuanto vuelve.
@Observable @MainActor
final class Connectivity {
    private(set) var isOnline: Bool = true
    nonisolated let changes: AsyncStream<Bool>

    private let monitor: NWPathMonitor
    private let continuation: AsyncStream<Bool>.Continuation
    private var started = false

    init(monitor: NWPathMonitor = .init()) {
        self.monitor = monitor
        let (stream, continuation) = AsyncStream<Bool>.makeStream()
        self.changes = stream
        self.continuation = continuation
    }

    func start() {
        guard !started else { return }
        started = true
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in self?.update(online) }
        }
        monitor.start(queue: DispatchQueue(label: "co.loatech.coco.red"))
    }

    func stop() {
        guard started else { return }
        started = false
        monitor.cancel()
    }

    /// Solo publica cuando cambia: la cola no debe despertarse por repeticiones.
    func update(_ online: Bool) {
        guard online != isOnline else { return }
        isOnline = online
        continuation.yield(online)
    }
}
