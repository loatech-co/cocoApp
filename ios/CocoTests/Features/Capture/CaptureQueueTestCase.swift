import XCTest

@testable import Coco

/// The bench the `CaptureQueue` tests share: a disk store in a temporary
/// directory, the doubles and a clock moved by hand. Each test class covers
/// one face of the queue.
class CaptureQueueTestCase: XCTestCase {
    var root: URL = URL(fileURLWithPath: "/")
    var store: DiskQueueStore = .init(root: URL(fileURLWithPath: "/"))
    var sender = SenderDouble()
    var session = SessionDouble()
    var notifier = NotifierDouble()
    /// A fixed clock the tests move by hand.
    let now = ControlledNow()

    // `@unchecked Sendable`: a test double. What changes while the test
    // runs goes under `lock`; what is configured is written before using it.
    final class ControlledNow: @unchecked Sendable {
        let lock = NSLock()
        var value = Date(timeIntervalSince1970: 1_800_000_000)
        func read() -> Date { lock.withLock { value } }
        func advance(_ s: TimeInterval) { lock.withLock { value = value.addingTimeInterval(s) } }
    }

    override func setUpWithError() throws {
        root = try TemporaryDirectory.directory()
        store = DiskQueueStore(root: root)
        sender = SenderDouble()
        session = SessionDouble()
        notifier = NotifierDouble()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    func queue(store: QueueStore? = nil, spacing: Duration = .zero, photoLimit: Int = 200 * 1024 * 1024)
        -> CaptureQueue
    {
        let clock = now
        return CaptureQueue(
            store: store ?? self.store,
            sender: sender,
            session: session,
            notifier: notifier,
            retryPolicy: Retry(jitter: 0),
            clock: { clock.read() },
            spacing: spacing,
            photoBytesLimit: photoLimit,
            shrinkPhoto: { $0 }
        )
    }

    let body = CaptureBody(merchant: "D1", amount: "45000", date: "2026-10-05")
    let photo = Data(repeating: 0xAB, count: 1024)
}
