import XCTest

@testable import Coco

/// What the external review asked of the queue: that cancellation and the
/// budget reach the in-flight request, that an unreadable 2xx is not
/// repeated, that the disk does not swallow errors and that an unreadable file is not
/// lost.
final class CaptureQueueHardeningTests: XCTestCase {
    private var root: URL = URL(fileURLWithPath: "/")
    private var sender = SenderDouble()
    private var notifier = NotifierDouble()

    override func setUpWithError() throws {
        root = try TemporaryDirectory.directory()
        sender = SenderDouble()
        notifier = NotifierDouble()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func queue(store: QueueStore? = nil) -> CaptureQueue {
        CaptureQueue(
            store: store ?? DiskQueueStore(root: root), sender: sender, session: SessionDouble(),
            notifier: notifier, retryPolicy: Retry(jitter: 0), spacing: .zero, shrinkPhoto: { $0 })
    }

    private let body = CaptureBody(merchant: "D1", amount: "45000", date: "2026-10-05")

    // MARK: Cancellation and budget

    /// A request that takes longer than the budget is cut when it runs out, and the
    /// capture stays in the queue as it was: neither an attempt nor an error.
    func testTheBudgetCutsARequestInFlightAndLeavesTheCaptureQueued() async throws {
        sender.replyToCapture(.hang)
        let q = queue()
        let c = try await q.enqueue(body, source: .wallet, photo: nil)
        let started = ContinuousClock.now
        let summary = await q.process(budget: .milliseconds(200))
        XCTAssertLessThan(ContinuousClock.now - started, .seconds(5))
        XCTAssertEqual(summary.sent, 0)
        XCTAssertEqual(summary.pending, 1)
        let after = await q.capture(id: c.id)
        XCTAssertEqual(after?.phase, .toSend)
        XCTAssertEqual(after?.attempts, 0)
        XCTAssertNil(after?.lastError)

        // The next run sends it.
        let next = await q.process(budget: .seconds(5))
        XCTAssertEqual(next.sent, 1)
    }

    /// Cancelling the caller (iOS takes back the background task or the intent) cuts
    /// the sending just like the budget.
    func testCancellingTheCallerCancelsTheRun() async throws {
        sender.replyToCapture(.hang)
        let q = queue()
        let c = try await q.enqueue(body, source: .sms, photo: nil)
        let caller = Task { await q.process(budget: .seconds(30)) }
        try await Task.sleep(for: .milliseconds(100))
        let started = ContinuousClock.now
        caller.cancel()
        let summary = await caller.value
        XCTAssertLessThan(ContinuousClock.now - started, .seconds(5))
        XCTAssertEqual(summary.sent, 0)
        let after = await q.capture(id: c.id)
        XCTAssertEqual(after?.phase, .toSend)
        XCTAssertEqual(after?.attempts, 0)
    }

    /// With the photo halfway: phase 1 is already on disk and the cancellation does not
    /// undo it.
    func testCancellingDuringThePhotoKeepsPhase1() async throws {
        sender.replyToPhoto(.hang)
        let q = queue()
        let c = try await q.enqueue(body, source: .iosPhoto, photo: Data(repeating: 1, count: 64))
        await q.process(budget: .milliseconds(300))
        let after = await q.capture(id: c.id)
        XCTAssertEqual(after?.phase, .photoToUpload(transactionId: sender.transactionId))
        XCTAssertNotNil(after?.photoPath)
    }

    /// An intent that arrives with another run under way does not inherit its wait: it leaves
    /// within ITS budget with the capture safe in the queue.
    func testACallerThatJoinsARunWaitsOnlyItsOwnBudget() async throws {
        sender.replyToCapture(.hang)
        let q = queue()
        try await q.enqueue(body, source: .wallet, photo: nil)
        let foreground = Task { await q.process(budget: .seconds(30)) }
        try await Task.sleep(for: .milliseconds(100))

        let capturer = QueuedCapturer(queue: q, notifier: notifier)
        let started = ContinuousClock.now
        let result = await capturer.capture(body, source: .wallet, photo: nil, budget: .milliseconds(300))
        XCTAssertLessThan(ContinuousClock.now - started, .seconds(5))
        XCTAssertEqual(result, .queued(pending: 2))
        foreground.cancel()
        _ = await foreground.value
    }

    // MARK: Unreadable 2xx

    /// The server created it: it stays «hecha, revisar», it is not retried by itself, it does not
    /// count as pending nor as failed.
    func testAnUnreadable2xxIsUnconfirmedAndNeverResent() async throws {
        sender.replyToCapture(.failure(APIError.unreadableSuccess(status: 201)))
        let q = queue()
        let c = try await q.enqueue(body, source: .wallet, photo: nil)
        let summary = await q.process()
        XCTAssertEqual(summary.unconfirmed, 1)
        XCTAssertEqual(summary.failed, 0)
        XCTAssertEqual(summary.pending, 0)
        guard case .unconfirmed = await q.capture(id: c.id)?.phase else {
            return XCTFail("it should have stayed unconfirmed")
        }
        XCTAssertTrue(notifier.failures.isEmpty)

        await q.retryNow(id: c.id)
        await q.process()
        XCTAssertEqual(sender.requests.count, 1, "an unconfirmed one is not sent again")

        await q.purge(doneOlderThan: .zero)
        let kept = await q.capture(id: c.id)
        XCTAssertNotNil(kept, "the purge does not take what is still to review")
    }

    func testTheCapturerReportsUnconfirmed() async {
        sender.replyToCapture(.failure(APIError.unreadableSuccess(status: 200)))
        let capturer = QueuedCapturer(queue: queue(), notifier: notifier)
        let result = await capturer.capture(body, source: .wallet, photo: nil, budget: .seconds(5))
        XCTAssertEqual(result, .unconfirmed)
        XCTAssertFalse(ActionParameters.dialogText(result).isEmpty)
    }

    /// An unreadable 2xx when uploading the photo: the photo arrived and the capture ends.
    func testAnUnreadable2xxOnThePhotoFinishesTheCapture() async throws {
        sender.replyToPhoto(.failure(APIError.unreadableSuccess(status: 201)))
        let q = queue()
        let c = try await q.enqueue(body, source: .iosPhoto, photo: Data(repeating: 1, count: 64))
        let summary = await q.process()
        XCTAssertEqual(summary.sent, 1)
        guard case .done = await q.capture(id: c.id)?.phase else { return XCTFail("it should have ended up done") }
    }

    // MARK: Disk errors

    /// If the disk does not allow writing, it shows: the queue publishes it instead of
    /// swallowing it, and a good write clears it.
    func testAFailedWriteIsVisibleInTheSnapshot() async throws {
        let failing = FailingStore(real: DiskQueueStore(root: root))
        sender.replyToCapture(.failure(APIError.server(status: 503)))
        let q = queue(store: failing)
        try await q.enqueue(body, source: .wallet, photo: nil)
        failing.failsSave = true
        await q.process()
        let broken = await q.snapshot()
        XCTAssertTrue(broken.diskError)

        failing.failsSave = false
        try await q.enqueue(body, source: .sms, photo: nil)
        let c = await q.all().first
        if let c { await q.retryNow(id: c.id) }
        let healed = await q.snapshot()
        XCTAssertFalse(healed.diskError)
    }

    /// A read that fails does not leave the badge at 0: the last read value holds.
    func testAFailedReadKeepsTheLastCount() async throws {
        let flaky = FlakyReadStore(real: DiskQueueStore(root: root))
        let q = queue(store: flaky)
        try await q.enqueue(body, source: .wallet, photo: nil)
        let before = await q.pending()
        XCTAssertEqual(before, 1)
        flaky.failsRead = true
        let during = await q.pending()
        XCTAssertEqual(during, 1)
        let snapshot = await q.snapshot()
        XCTAssertTrue(snapshot.diskError)
    }

    // MARK: Format and quarantine

    func testEveryCaptureIsWrittenWithTheFormatVersion() async throws {
        let c = try await queue().enqueue(body, source: .wallet, photo: nil)
        let data = try Data(contentsOf: root.appending(path: "\(c.id.uuidString).json"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["version"] as? Int, PendingCapture.formatVersion)
    }

    /// A corrupt file and another from an unknown version do not bring down the
    /// queue, are not deleted and are counted for the captures screen.
    func testUnreadableFilesGoToQuarantineIntactAndAreCounted() async throws {
        let q = queue()
        let good = try await q.enqueue(body, source: .wallet, photo: nil)
        let goodFile = root.appending(path: "\(good.id.uuidString).json")
        let futureText = try String(contentsOf: goodFile, encoding: .utf8)
            .replacingOccurrences(of: #""version":1"#, with: #""version":99"#)
            .replacingOccurrences(of: good.id.uuidString, with: UUID().uuidString)
        let future = root.appending(path: "future.json")
        try Data(futureText.utf8).write(to: future)
        let corrupt = root.appending(path: "corrupt.json")
        try Data("{ no es json".utf8).write(to: corrupt)

        let snapshot = await q.snapshot()
        XCTAssertEqual(snapshot.captures.map(\.id), [good.id])
        XCTAssertEqual(snapshot.unreadable, 2)

        let quarantine = root.appending(path: DiskQueueStore.quarantineFolderName)
        XCTAssertEqual(
            try Data(contentsOf: quarantine.appending(path: "corrupt.json")), Data("{ no es json".utf8))
        XCTAssertEqual(
            try String(contentsOf: quarantine.appending(path: "future.json"), encoding: .utf8), futureText)
        XCTAssertFalse(FileManager.default.fileExists(atPath: corrupt.path(percentEncoded: false)))
    }

    func testTheQueueLivesInApplicationSupportAndNotInTmp() {
        let path = DiskQueueStore.defaultRoot.path(percentEncoded: false)
        XCTAssertTrue(path.contains("/Library/Application Support/"), path)
        XCTAssertFalse(path.hasPrefix(FileManager.default.temporaryDirectory.path(percentEncoded: false)))
        XCTAssertTrue(DiskTreeStore.atDefaultLocation.file.path(percentEncoded: false).contains("Application Support"))
    }

    func testANewFolderIsExcludedFromBackup() async throws {
        let fresh = root.appending(path: "fresh", directoryHint: .isDirectory)
        try await queue(store: DiskQueueStore(root: fresh)).enqueue(body, source: .wallet, photo: nil)
        let values = try fresh.resourceValues(forKeys: [.isExcludedFromBackupKey])
        XCTAssertEqual(values.isExcludedFromBackup, true)
    }
}

/// A store whose read fails when asked to: the disk still locked.
/// `@unchecked Sendable`: a test double; `failsRead` is written by the test
/// between calls, never at the same time the queue reads.
private final class FlakyReadStore: QueueStore, @unchecked Sendable {
    let real: DiskQueueStore
    var failsRead = false
    init(real: DiskQueueStore) { self.real = real }

    struct LockedDiskError: Error {}

    func save(_ capture: PendingCapture) throws { try real.save(capture) }
    func all() throws -> [PendingCapture] {
        if failsRead { throw LockedDiskError() }
        return try real.all()
    }
    func delete(id: UUID) throws { try real.delete(id: id) }
    func savePhoto(_ jpeg: Data, id: UUID) throws -> String { try real.savePhoto(jpeg, id: id) }
    func photo(at path: String) throws -> Data { try real.photo(at: path) }
    func deletePhoto(at path: String) throws { try real.deletePhoto(at: path) }
    func photoBytes() throws -> Int { try real.photoBytes() }
    func quarantined() throws -> Int { try real.quarantined() }
}
