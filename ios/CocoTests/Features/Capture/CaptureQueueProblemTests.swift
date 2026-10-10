import XCTest

@testable import Coco

/// What the queue does with each family of v2 problems: it is decided by the
/// `code`, read from a `problem+json` body like the one the API sends.
final class CaptureQueueProblemTests: XCTestCase {
    private var root: URL = URL(fileURLWithPath: "/")
    private var store: DiskQueueStore = .init(root: URL(fileURLWithPath: "/"))
    private var sender = SenderDouble()
    private var session = SessionDouble()
    private var notifier = NotifierDouble()
    private let now = CaptureQueueTests.ControlledNow()
    private let body = CaptureBody(merchant: "D1", amount: "45000", date: "2026-10-05")

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

    private func queue() -> CaptureQueue {
        let clock = now
        return CaptureQueue(
            store: store, sender: sender, session: session, notifier: notifier, retryPolicy: Retry(jitter: 0),
            clock: { clock.read() }, spacing: .zero, shrinkPhoto: { $0 })
    }

    /// The error the client would give with that response.
    private func problem(_ status: Int, _ code: String, detail: String = "No cuadra") -> SenderDouble.Reply {
        .failure(APIError.from(status: status, body: Data(APIProblemTests.problem(status, code, detail: detail).utf8)))
    }

    private func enqueued(photo: Data? = nil) async throws -> (CaptureQueue, UUID) {
        let c = queue()
        let id = UUID()
        try await c.enqueue(body, source: .wallet, photo: photo, id: id)
        return (c, id)
    }

    func testValidationFailsVisiblyWithoutRetrying() async throws {
        for (status, code) in [(422, "validation_failed"), (422, "amount_breaks_splits"), (422, "category_not_owned")] {
            let (c, id) = try await enqueued()
            sender.replyToCapture(problem(status, code, detail: "Frase de \(code)"))
            let summary = await c.process()
            XCTAssertEqual(summary.failed, 1, code)
            let capture = await c.capture(id: id)
            XCTAssertEqual(capture?.phase, .failed(reason: "Frase de \(code)"), code)
            XCTAssertEqual(capture?.attempts, 0, code)
            try await c.discard(id: id)
        }
        XCTAssertEqual(sender.requests.count, 3, "none is retried")
        XCTAssertEqual(notifier.failures.count, 3)
        XCTAssertEqual(session.refreshes, 0)
    }

    func testAnExpiredSessionRenewsAndRetries() async throws {
        let (c, _) = try await enqueued()
        sender.replyToCapture(problem(401, "session_expired"))
        let summary = await c.process()
        XCTAssertEqual(session.refreshes, 1)
        XCTAssertEqual(summary.sent, 1)
    }

    func testARevokedSessionClosesWithoutRenewing() async throws {
        let (c, id) = try await enqueued()
        sender.replyToCapture(problem(401, "session_revoked"))
        await c.process()
        XCTAssertEqual(session.refreshes, 0)
        XCTAssertEqual(session.discards, 1)
        let capture = await c.capture(id: id)
        XCTAssertEqual(capture?.phase, .awaitingSession)
        XCTAssertEqual(capture?.lastError, L10n.Problem.sessionRevoked)
        XCTAssertEqual(capture?.attempts, 0)
    }

    func testRateLimitAndUnavailableWaitLongerEachTime() async throws {
        let (c, id) = try await enqueued()
        sender.replyToCapture(problem(429, "rate_limited"))
        await c.process()
        var capture = await c.capture(id: id)
        XCTAssertEqual(capture?.phase, .toSend)
        XCTAssertEqual(capture?.nextAttempt, now.read().addingTimeInterval(5))

        now.advance(5)
        sender.replyToCapture(problem(503, "service_unavailable"))
        await c.process()
        capture = await c.capture(id: id)
        XCTAssertEqual(capture?.attempts, 2)
        XCTAssertEqual(capture?.nextAttempt, now.read().addingTimeInterval(10))
        XCTAssertEqual(notifier.failures, [])
    }

    func testADuplicateCountsAsDone() async throws {
        let (c, id) = try await enqueued()
        sender.replyToCapture(problem(409, "duplicate", detail: "Ya estaba registrado"))
        let summary = await c.process()
        XCTAssertEqual(summary.sent, 1)
        XCTAssertEqual(summary.failed, 0)
        guard case .done(let result)? = await c.capture(id: id)?.phase else { return XCTFail("it should be done") }
        XCTAssertTrue(result.duplicate)
        XCTAssertEqual(notifier.isRegistered.map(\.duplicate), [true])
        XCTAssertEqual(notifier.failures, [])
    }

    /// A duplicate on the text with a pending photo: it is not known which
    /// transaction it goes to, so it is NOT closed as done (it would delete the receipt).
    /// It stays «Por revisar», with the photo on disk and the reason visible.
    func testADuplicateWithAPendingPhotoKeepsThePhotoForReview() async throws {
        let jpeg = Data(repeating: 0xAB, count: 64)
        let (c, id) = try await enqueued(photo: jpeg)
        sender.replyToCapture(problem(409, "duplicate"))
        let summary = await c.process()
        XCTAssertEqual(summary.unconfirmed, 1)
        XCTAssertEqual(summary.sent, 0)
        let stored = await c.capture(id: id)
        let capture = try XCTUnwrap(stored)
        guard case .unconfirmed = capture.phase else { return XCTFail("it should be left to review") }
        XCTAssertEqual(capture.lastError, L10n.Queue.errorDuplicateWithPhoto)
        let path = try XCTUnwrap(capture.photoPath)
        XCTAssertEqual(try store.photo(at: path), jpeg)
        XCTAssertEqual(sender.uploads.count, 0)
        XCTAssertEqual(notifier.isRegistered, [])

        // One more run does not resend it.
        await c.process()
        XCTAssertEqual(sender.requests.count, 1)
    }

    /// A duplicate when uploading the photo: the photo was already there, the capture ends done
    /// with the result of the text.
    func testADuplicatePhotoKeepsTheTextResult() async throws {
        let (c, id) = try await enqueued(photo: Data(repeating: 0xAB, count: 64))
        sender.replyToCapture(.ok)
        sender.replyToPhoto(problem(409, "duplicate"))
        await c.process()
        guard case .done(let result)? = await c.capture(id: id)?.phase else { return XCTFail("it should be done") }
        XCTAssertNotEqual(result.transactionId, 0)
        XCTAssertEqual(sender.uploads.count, 1)
    }
}
