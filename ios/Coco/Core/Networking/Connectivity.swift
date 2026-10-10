import Foundation
import Network
import Observation

/// Whether there is network or not, according to `NWPathMonitor`. The interface reads it (`isOnline`) and
/// the queue listens to it (`changes`) to retry as soon as it comes back.
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
        monitor.start(queue: DispatchQueue(label: "co.loatech.coco.network"))
    }

    /// It only publishes when it changes: the queue must not wake up for repeats.
    func update(_ online: Bool) {
        guard online != isOnline else { return }
        isOnline = online
        continuation.yield(online)
    }
}
