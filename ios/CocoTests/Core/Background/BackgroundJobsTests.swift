import BackgroundTasks
import XCTest

@testable import Coco

final class BackgroundJobsTests: XCTestCase {
    private var root: URL = URL(fileURLWithPath: "/")

    override func setUpWithError() throws {
        root = try TemporaryDirectory.directory()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    func testSchedulesWithTheInfoPlistIdentifiers() {
        let permitted = BackgroundJobs.permittedIdentifiers()
        XCTAssertEqual(
            Set(permitted), ["co.loatech.coco.refresh", "co.loatech.coco.queue"], "el Info.plist de la app los declara")
        let requests = BackgroundJobs.requests()
        XCTAssertEqual(Set(requests.map(\.identifier)), Set(permitted))
        XCTAssertTrue(requests.contains { $0 is BGAppRefreshTaskRequest && $0.identifier == BackgroundJobs.refresh })
        let processingRequest = requests.compactMap { $0 as? BGProcessingTaskRequest }.first
        XCTAssertEqual(processingRequest?.identifier, BackgroundJobs.queue)
        XCTAssertEqual(processingRequest?.requiresNetworkConnectivity, true)
    }

    func testScheduleWithoutRegistrationDoesNotTouchTheScheduler() {
        // `submit` without a registered handler is an Objective-C exception,
        // not a `throws`: scheduling has to skip it instead of crashing.
        let scheduler = SchedulerSpy()
        BackgroundJobs.schedule(scheduler: scheduler, isRegistered: false)
        XCTAssertEqual(scheduler.submitted, [])
    }

    func testScheduleOnceRegisteredSubmitsBothRequests() {
        let scheduler = SchedulerSpy()
        BackgroundJobs.schedule(scheduler: scheduler, isRegistered: true)
        XCTAssertEqual(Set(scheduler.submitted), [BackgroundJobs.refresh, BackgroundJobs.queue])
    }

    func testRunQueueSendsThePendingAndTheQueueNotifiesOnce() async throws {
        let store = DiskQueueStore(root: root)
        let notifier = NotifierDouble()
        let queue = CaptureQueue(
            store: store, sender: SenderDouble(), session: SessionDouble(), notifier: notifier,
            spacing: .zero, shrinkPhoto: { $0 })
        // Two captures that already failed once: what is found in the background.
        for i in 1...2 {
            try store.save(
                PendingCapture(
                    source: .iosManual, body: CaptureBody(merchant: "D\(i)", amount: "1000", date: "2026-10-05"),
                    attempts: 1))
        }
        let sent = await BackgroundJobs.runQueue(queue: queue, notifier: notifier, budget: .seconds(5))
        XCTAssertEqual(sent, 2)
        XCTAssertEqual(notifier.queueSentCounts, [2])
        XCTAssertEqual(notifier.badges.last, 0)
    }

    func testRunQueueWithNothingDoesNotNotify() async {
        let notifier = NotifierDouble()
        let queue = CaptureQueue(
            store: DiskQueueStore(root: root), sender: SenderDouble(), session: SessionDouble(),
            notifier: notifier, spacing: .zero, shrinkPhoto: { $0 })
        let sent = await BackgroundJobs.runQueue(queue: queue, notifier: notifier, budget: .seconds(5))
        XCTAssertEqual(sent, 0)
        XCTAssertEqual(notifier.queueSentCounts, [])
    }

    func testRunRefreshAsksForATokenAndRefreshesTheTree() async throws {
        let session = SessionDouble()
        let transport = FakeTransport([
            .http(
                200,
                #"{"data":[{"id":1,"name":"Hogar","parentId":null,"keywords":[],"isArchived":false,"isStatic":false,"children":null}],"meta":{"page":1,"perPage":200,"total":1}}"#
            )
        ])
        let base = try XCTUnwrap(URL(string: "https://api.coco.invalid"))
        let api = APIClient(configuration: APIConfiguration(base: base), transport: transport, version: "0.1.0")
        let tree = TreeSynchronizer(
            api: api, session: session, store: DiskTreeStore(file: root.appending(path: "tree.json")))

        await BackgroundJobs.runRefresh(session: session, tree: tree)

        XCTAssertGreaterThanOrEqual(session.tokenReads, 1)
        XCTAssertEqual(transport.received.map { $0.url?.path }, ["/api/v2/categories"])
        let index = await tree.index()
        XCTAssertEqual(index?.entries.map(\.name), ["Hogar"])
    }
}

/// Records what would have reached `BGTaskScheduler`.
private final class SchedulerSpy: TaskSubmitting {
    private(set) var submitted: [String] = []

    func submit(_ taskRequest: BGTaskRequest) throws {
        submitted.append(taskRequest.identifier)
    }
}
