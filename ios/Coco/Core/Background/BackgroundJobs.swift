import BackgroundTasks
import Foundation

/// Lo que iOS concede en segundo plano: una renovación corta (sesión tibia y
/// árbol fresco) y un procesado de la cola con red. Son una ayuda, no una
/// garantía: la cola también se dispara en primer plano, al volver la red,
/// tras cada encolado y tras cada login. Si iOS nunca las concede, nada se
/// pierde; solo tarda más en enviarse.
enum BackgroundJobs {
    /// BGAppRefreshTask.
    static let refresh = "co.loatech.coco.refresh"
    /// BGProcessingTask, con red.
    static let queue = "co.loatech.coco.queue"

    /// Lo que declara `BGTaskSchedulerPermittedIdentifiers` en el Info.plist:
    /// si una tarea se programa con un identificador que no está ahí, iOS
    /// la rechaza en silencio.
    static func permittedIdentifiers(in bundle: Bundle = .main) -> [String] {
        bundle.object(forInfoDictionaryKey: "BGTaskSchedulerPermittedIdentifiers") as? [String] ?? []
    }

    /// `submit` sin un handler registrado no lanza un error: lanza una
    /// excepción de Objective-C que tumba la app. Por eso se recuerda si
    /// `registrar` ya pasó y `programar` no hace nada antes.
    private static let registry = Registry()
    private final class Registry: @unchecked Sendable {
        private let lock = NSLock()
        private var done = false
        var value: Bool {
            get { lock.withLock { done } }
            set { lock.withLock { done = newValue } }
        }
    }
    static var isRegistered: Bool { registry.value }

    /// Antes de que termine `didFinishLaunching`; después iOS ya no deja.
    @MainActor
    static func register(
        session: Session, queue: CaptureQueue, tree: TreeSynchronizer, notifier: Notifier,
        scheduler: BGTaskScheduler = .shared
    ) {
        registry.value = true
        scheduler.register(forTaskWithIdentifier: refresh, using: nil) { task in
            runTask(task, scheduler: scheduler) {
                await runRefresh(session: session, tree: tree)
            }
        }
        scheduler.register(forTaskWithIdentifier: Self.queue, using: nil) { task in
            runTask(task, scheduler: scheduler) {
                _ = await runQueue(queue: queue, notifier: notifier, budget: .seconds(25))
            }
        }
    }

    /// Al pasar a segundo plano y al terminar cada tarea. Si el sistema
    /// rechaza la solicitud —simulador, identificador sin registrar— se
    /// ignora: la corrección nunca depende de esto.
    static func schedule(scheduler: BGTaskScheduler = .shared) {
        guard isRegistered else { return }
        for request in requests() {
            try? scheduler.submit(request)
        }
    }

    /// Puro: las dos solicitudes, para comprobar sus identificadores sin
    /// tocar el `BGTaskScheduler` real.
    static func requests(now: Date = .now) -> [BGTaskRequest] {
        let refreshRequest = BGAppRefreshTaskRequest(identifier: refresh)
        refreshRequest.earliestBeginDate = now.addingTimeInterval(15 * 60)
        let processingRequest = BGProcessingTaskRequest(identifier: queue)
        processingRequest.requiresNetworkConnectivity = true
        processingRequest.requiresExternalPower = false
        processingRequest.earliestBeginDate = now.addingTimeInterval(60)
        return [refreshRequest, processingRequest]
    }

    /// `validAccessToken()` renueva si el token está por vencer (y es la
    /// única vía de renovación, para no competir con los intents); el árbol
    /// solo se baja si pasó su edad máxima.
    static func runRefresh(session: Session, tree: TreeSynchronizer) async {
        _ = try? await session.validAccessToken()
        await tree.refreshIfNeeded()
    }

    /// Procesa dentro del presupuesto y devuelve cuántas se enviaron. El
    /// aviso «Se enviaron N capturas pendientes» lo emite la propia cola al
    /// terminar su pasada; repetirlo aquí sería avisar dos veces.
    static func runQueue(queue: CaptureQueue, notifier: Notifier, budget: Duration) async -> Int {
        let summary = await queue.process(budget: budget)
        await notifier.setBadge(summary.pending)
        return summary.sent
    }

    private static func runTask(
        _ task: BGTask, scheduler: BGTaskScheduler, _ work: @escaping @Sendable () async -> Void
    ) {
        let execution = Task {
            await work()
            task.setTaskCompleted(success: !Task.isCancelled)
            schedule(scheduler: scheduler)
        }
        // Al expirar se cancela el trabajo; el propio `Task` cierra la tarea
        // una sola vez al salir.
        task.expirationHandler = { execution.cancel() }
    }
}
