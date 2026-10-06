import BackgroundTasks
import Foundation
import os

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
    /// `register` ya pasó y `schedule` no hace nada antes.
    private static let registry = OSAllocatedUnfairLock(initialState: false)
    static var isRegistered: Bool { registry.withLock { $0 } }

    /// Antes de que termine `didFinishLaunching`; después iOS ya no deja.
    @MainActor
    static func register(
        session: Session, queue: CaptureQueue, tree: TreeSynchronizer, notifier: Notifier,
        scheduler: BGTaskScheduler = .shared
    ) {
        registry.withLock { $0 = true }
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

    /// `BGTask` no es `Sendable`, pero lo único que se hace con él fuera del
    /// hilo donde llega —`setTaskCompleted` y `expirationHandler`— lo admite
    /// desde cualquier hilo (documentación de BackgroundTasks). Esta caja solo
    /// le deja cruzar al `Task` que hace el trabajo.
    private struct TaskHandle: @unchecked Sendable {
        let task: BGTask
        let scheduler: BGTaskScheduler
    }

    /// El trabajo corre en un `Task` que iOS cancela al expirar la tarea: la
    /// cancelación llega a la cola (`withTaskCancellationHandler`), que corta
    /// la petición en vuelo y deja la captura en disco tal como estaba.
    private static func runTask(
        _ task: BGTask, scheduler: BGTaskScheduler, _ work: @escaping @Sendable () async -> Void
    ) {
        let handle = TaskHandle(task: task, scheduler: scheduler)
        let execution = Task {
            await work()
            handle.task.setTaskCompleted(success: !Task.isCancelled)
            schedule(scheduler: handle.scheduler)
        }
        // Al expirar se cancela el trabajo; el propio `Task` cierra la tarea
        // una sola vez al salir.
        task.expirationHandler = { execution.cancel() }
    }
}
