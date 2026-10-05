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

    func testScheduleWithoutRegistrationDoesNotTouchTheScheduler() throws {
        // `submit` sin registro es una excepción de ObjC, no un `throws`:
        // programar tiene que saltárselo en vez de reventar. La app
        // anfitriona registra al arrancar (M9), así que dentro de ella la
        // prueba no tiene el caso que quiere probar.
        try XCTSkipIf(BackgroundJobs.isRegistered, "la app anfitriona ya registró las tareas al arrancar")
        BackgroundJobs.schedule()
    }

    func testRunQueueSendsThePendingAndTheQueueNotifiesOnce() async throws {
        let store = DiskQueueStore(root: root)
        let notifier = NotifierDouble()
        let queue = CaptureQueue(
            store: store, sender: SenderDouble(), session: SessionDouble(), notifier: notifier,
            spacing: .zero, shrinkPhoto: { $0 })
        // Dos capturas que ya fallaron una vez: lo que se encuentra en fondo.
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
                #"{"data":[{"id":1,"name":"Hogar","parent_id":null,"palabras_clave":[],"is_archived":false,"estatico":false,"children":null}],"meta":{}}"#
            )
        ])
        let base = try XCTUnwrap(URL(string: "https://api.coco.invalid"))
        let api = APIClient(configuration: APIConfiguration(base: base), transport: transport, version: "0.1.0")
        let tree = TreeSynchronizer(
            api: api, session: session, store: DiskTreeStore(file: root.appending(path: "tree.json")))

        await BackgroundJobs.runRefresh(session: session, tree: tree)

        XCTAssertGreaterThanOrEqual(session.tokenReads, 1)
        XCTAssertEqual(transport.received.map { $0.url?.path }, ["/api/v1/categories"])
        let index = await tree.index()
        XCTAssertEqual(index?.entries.map(\.name), ["Hogar"])
    }
}
