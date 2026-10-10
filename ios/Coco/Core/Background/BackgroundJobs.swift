import BackgroundTasks
import Foundation
import os

/// What iOS grants in the background: a short refresh (warm session and
/// fresh tree) and a processing of the queue with network. They are a help, not a
/// guarantee: the queue also fires in the foreground, when the network comes back,
/// after each enqueue and after each login. If iOS never grants them, nothing is
/// lost; it only takes longer to send.
enum BackgroundJobs {
    /// BGAppRefreshTask.
    static let refresh = "co.loatech.coco.refresh"
    /// BGProcessingTask, with network.
    static let queue = "co.loatech.coco.queue"

    /// What `BGTaskSchedulerPermittedIdentifiers` declares in the Info.plist:
    /// if a task is scheduled with an identifier that is not there, iOS
    /// rejects it silently.
    static func permittedIdentifiers(in bundle: Bundle = .main) -> [String] {
        bundle.object(forInfoDictionaryKey: "BGTaskSchedulerPermittedIdentifiers") as? [String] ?? []
    }

    /// `submit` without a registered handler does not throw an error: it raises an
    /// Objective-C exception that brings the app down. That is why it remembers whether
    /// `register` already happened, and `schedule` does nothing before it.
    private static let registry = OSAllocatedUnfairLock(initialState: false)
    static var isRegistered: Bool { registry.withLock { $0 } }

    /// Before `didFinishLaunching` finishes; afterwards iOS no longer allows it.
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

    /// On moving to the background and at the end of each task. If the system
    /// rejects the request —simulator, unregistered identifier— it is
    /// ignored: correctness never depends on this.
    ///
    /// `isRegistered` is a parameter so the tests can reach the unregistered
    /// case: the host app has already registered by the time they run.
    static func schedule(
        scheduler: any TaskSubmitting = BGTaskScheduler.shared,
        isRegistered: Bool = BackgroundJobs.isRegistered
    ) {
        guard isRegistered else { return }
        for request in requests() {
            try? scheduler.submit(request)
        }
    }

    /// Pure: the two requests, to check their identifiers without
    /// touching the real `BGTaskScheduler`.
    static func requests(now: Date = .now) -> [BGTaskRequest] {
        let refreshRequest = BGAppRefreshTaskRequest(identifier: refresh)
        refreshRequest.earliestBeginDate = now.addingTimeInterval(15 * 60)
        let processingRequest = BGProcessingTaskRequest(identifier: queue)
        processingRequest.requiresNetworkConnectivity = true
        processingRequest.requiresExternalPower = false
        processingRequest.earliestBeginDate = now.addingTimeInterval(60)
        return [refreshRequest, processingRequest]
    }

    /// `validAccessToken()` refreshes if the token is about to expire (and it is the
    /// only refresh path, so as not to compete with the intents); the tree
    /// is only downloaded if it is past its maximum age.
    static func runRefresh(session: Session, tree: TreeSynchronizer) async {
        _ = try? await session.validAccessToken()
        await tree.refreshIfNeeded()
    }

    /// Processes within the budget and returns how many were sent. The
    /// notice «Se enviaron N capturas pendientes» is issued by the queue itself when
    /// it finishes its pass; repeating it here would notify twice.
    static func runQueue(queue: CaptureQueue, notifier: Notifier, budget: Duration) async -> Int {
        let summary = await queue.process(budget: budget)
        await notifier.setBadge(summary.pending)
        return summary.sent
    }

    /// `BGTask` is not `Sendable`, but the only things done with it outside the
    /// thread where it arrives —`setTaskCompleted` and `expirationHandler`— allow it
    /// from any thread (BackgroundTasks documentation). This box only
    /// lets it cross to the `Task` that does the work.
    private struct TaskHandle: @unchecked Sendable {
        let task: BGTask
        let scheduler: BGTaskScheduler
    }

    /// The work runs in a `Task` that iOS cancels when the task expires: the
    /// cancellation reaches the queue (`withTaskCancellationHandler`), which cuts
    /// the in-flight request and leaves the capture on disk just as it was.
    private static func runTask(
        _ task: BGTask, scheduler: BGTaskScheduler, _ work: @escaping @Sendable () async -> Void
    ) {
        let handle = TaskHandle(task: task, scheduler: scheduler)
        let execution = Task {
            await work()
            handle.task.setTaskCompleted(success: !Task.isCancelled)
            schedule(scheduler: handle.scheduler)
        }
        // On expiry the work is cancelled; the `Task` itself closes the task
        // only once when it exits.
        task.expirationHandler = { execution.cancel() }
    }
}

/// The one part of `BGTaskScheduler` that `schedule` uses, so the tests can
/// stand in for it without touching the real scheduler.
protocol TaskSubmitting {
    func submit(_ taskRequest: BGTaskRequest) throws
}

extension BGTaskScheduler: TaskSubmitting {}
