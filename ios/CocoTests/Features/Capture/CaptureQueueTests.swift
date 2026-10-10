import XCTest

@testable import Coco

final class CaptureQueueTests: XCTestCase {
    private var root: URL = URL(fileURLWithPath: "/")
    private var store: DiskQueueStore = .init(root: URL(fileURLWithPath: "/"))
    private var sender = SenderDouble()
    private var session = SessionDouble()
    private var notifier = NotifierDouble()
    /// A fixed clock the tests move by hand.
    private let now = ControlledNow()

    // `@unchecked Sendable`: a test double. What changes while the test
    // runs goes under `lock`; what is configured is written before using it.
    final class ControlledNow: @unchecked Sendable {
        private let lock = NSLock()
        private var value = Date(timeIntervalSince1970: 1_800_000_000)
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

    private func queue(store: QueueStore? = nil, spacing: Duration = .zero, photoLimit: Int = 200 * 1024 * 1024)
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

    private let body = CaptureBody(merchant: "D1", amount: "45000", date: "2026-10-05")
    private let photo = Data(repeating: 0xAB, count: 1024)

    // MARK: Persistence

    func testEnqueuePersistsAndAnotherQueueOnTheSameDirectorySeesIt() async throws {
        let id = UUID()
        let c = try await queue().enqueue(body, source: .wallet, photo: photo, id: id)
        XCTAssertEqual(c.request.externalRef, id.uuidString)

        let other = queue()
        let all = await other.all()
        XCTAssertEqual(all.map(\.id), [id])
        XCTAssertEqual(all.first?.request.externalRef, id.uuidString)
        XCTAssertEqual(all.first?.photoPath, "Photos/\(id.uuidString).jpg")
        XCTAssertEqual(try store.photo(at: "Photos/\(id.uuidString).jpg"), photo)
    }

    func testAFailedWriteLeavesThePreviousJSONIntact() throws {
        let id = UUID()
        let original = PendingCapture(id: id, source: .sms, body: body)
        try store.save(original)
        // What was on disk before the attempt (the Date comes back with milliseconds).
        let onDisk = try store.all()
        XCTAssertEqual(onDisk.map(\.id), [id])
        // Without write permission the replacement fails halfway.
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o500], ofItemAtPath: root.path(percentEncoded: false))
        defer {
            try? FileManager.default.setAttributes(
                [.posixPermissions: 0o700], ofItemAtPath: root.path(percentEncoded: false))
        }
        var changed = original
        changed.attempts = 9
        XCTAssertThrowsError(try store.save(changed))
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o700], ofItemAtPath: root.path(percentEncoded: false))
        XCTAssertEqual(try store.all(), onDisk)
    }

    // MARK: Idempotency

    func testEnqueueingTheSameIdTwiceLeavesOne() async throws {
        let id = UUID()
        let c = queue()
        try await c.enqueue(body, source: .wallet, photo: nil, id: id)
        try await c.enqueue(CaptureBody(text: "otra"), source: .sms, photo: nil, id: id)
        let all = await c.all()
        XCTAssertEqual(all.count, 1)
        XCTAssertEqual(all.first?.body, body)
    }

    func testProcessingTwiceSendsOnePostPerCapture() async throws {
        let c = queue()
        try await c.enqueue(body, source: .wallet, photo: nil)
        try await c.enqueue(body, source: .sms, photo: nil)
        await c.process()
        await c.process()
        XCTAssertEqual(sender.requests.count, 2)
        XCTAssertEqual(sender.uniqueRefs.count, 2)
    }

    func testDuplicateCountsAsDone() async throws {
        let c = queue()
        let id = UUID()
        try await c.enqueue(body, source: .wallet, photo: nil, id: id)
        // The double answers isDuplicate:true when it already saw the externalRef.
        _ = try await sender.capture(PendingCapture(id: id, source: .wallet, body: body).request)
        let summary = await c.process()
        XCTAssertEqual(summary.sent, 1)
        guard case .done(let r)? = await c.capture(id: id)?.phase else { return XCTFail("no quedó hecha") }
        XCTAssertTrue(r.duplicate)
    }

    func testIfTheStoreDiesAfterPhase1TheSameRefIsResentAndThePhotoUploadsOnce() async throws {
        let fragile = FailingStore(real: store)
        let c = queue(store: fragile)
        let id = UUID()
        try await c.enqueue(body, source: .iosPhoto, photo: photo, id: id)
        fragile.failsSave = true
        sender.replyToPhoto(.failure(APIError.noNetwork(.notConnectedToInternet)))
        await c.process()
        // Phase 1 arrived but could not be noted down: it is still .toSend on disk.
        guard case .toSend? = await c.capture(id: id)?.phase else { return XCTFail("debería seguir porEnviar") }

        fragile.failsSave = false
        let second = queue(store: fragile)
        let summary = await second.process()
        XCTAssertEqual(summary.sent, 1)
        XCTAssertEqual(sender.requests.count, 2)
        XCTAssertEqual(sender.uniqueRefs.count, 1)
        XCTAssertEqual(sender.uploads.filter { $0.transactionId == 100 }.count, 2)
        XCTAssertEqual(Set(sender.uploads.map(\.name)).count, 1)
        XCTAssertEqual(try store.photoBytes(), 0)
    }

    // MARK: Retries

    func testTwoNetworkFailuresGrowTheDelayAndNothingIsSentEarly() async throws {
        let c = queue()
        let id = UUID()
        try await c.enqueue(body, source: .wallet, photo: nil, id: id)

        sender.replyToCapture(.failure(APIError.noNetwork(.notConnectedToInternet)))
        await c.process()
        var capture = await c.capture(id: id)
        XCTAssertEqual(capture?.attempts, 1)
        XCTAssertEqual(capture?.nextAttempt, now.read().addingTimeInterval(5))

        // Before its time the network is not touched.
        now.advance(4)
        await c.process()
        XCTAssertEqual(sender.requests.count, 1)

        now.advance(1)
        sender.replyToCapture(.failure(APIError.timedOut))
        await c.process()
        capture = await c.capture(id: id)
        XCTAssertEqual(capture?.attempts, 2)
        XCTAssertEqual(capture?.nextAttempt, now.read().addingTimeInterval(10))

        now.advance(10)
        sender.replyToCapture(.failure(APIError.server(status: 503)))
        await c.process()
        capture = await c.capture(id: id)
        XCTAssertEqual(capture?.attempts, 3)
        XCTAssertEqual(capture?.nextAttempt, now.read().addingTimeInterval(20))
        XCTAssertEqual(sender.requests.count, 3)
    }

    func testTheDelayIsCappedAtOneHour() async throws {
        let c = queue()
        let id = UUID()
        try await c.enqueue(body, source: .wallet, photo: nil, id: id)
        for _ in 0..<12 {
            sender.replyToCapture(.failure(APIError.server(status: 500)))
            await c.process()
            now.advance(4000)
        }
        let capture = await c.capture(id: id)
        XCTAssertEqual(capture?.attempts, 12)
        XCTAssertEqual(capture?.nextAttempt, now.read().addingTimeInterval(3600 - 4000))
    }

    func test429And5xxAnd408AreRetryable() async throws {
        let c = queue()
        let id = UUID()
        try await c.enqueue(body, source: .wallet, photo: nil, id: id)
        for status in [429, 503, 408] {
            sender.replyToCapture(.failure(APIError.server(status: status)))
            await c.process()
            guard case .toSend? = await c.capture(id: id)?.phase else {
                return XCTFail("\(status) debería seguir porEnviar")
            }
            now.advance(4000)
        }
        XCTAssertEqual(notifier.failures, [])
    }

    func testA401RefreshesOnceAndRetriesImmediately() async throws {
        let c = queue()
        let id = UUID()
        try await c.enqueue(body, source: .wallet, photo: nil, id: id)
        sender.replyToCapture(.failure(APIError.unauthenticated))
        let summary = await c.process()
        XCTAssertEqual(session.refreshes, 1)
        XCTAssertEqual(sender.requests.count, 2)
        XCTAssertEqual(summary.sent, 1)
    }

    func testIfStill401AwaitsSessionWithoutGrowingTheDelayAndSessionReturnedResumesIt() async throws {
        let c = queue()
        let id = UUID()
        try await c.enqueue(body, source: .wallet, photo: nil, id: id)
        sender.replyToCapture(.failure(APIError.unauthenticated))
        sender.replyToCapture(.failure(APIError.unauthenticated))
        await c.process()
        var capture = await c.capture(id: id)
        XCTAssertEqual(capture?.phase, .awaitingSession)
        XCTAssertEqual(capture?.attempts, 0)
        XCTAssertEqual(session.refreshes, 1)

        await c.process()
        XCTAssertEqual(sender.requests.count, 2, "esperando sesión no se reenvía")

        await c.sessionReturned()
        capture = await c.capture(id: id)
        XCTAssertEqual(capture?.phase, .toSend)
        let summary = await c.process()
        XCTAssertEqual(summary.sent, 1)
    }

    func testA422StaysFailedWithMessageAndNoMoreAttempts() async throws {
        let c = queue()
        let id = UUID()
        try await c.enqueue(body, source: .wallet, photo: nil, id: id)
        sender.replyToCapture(
            .failure(APIError.rejected(APIProblem(status: 422, code: .validationFailed, detail: "Falta el texto"))))
        let summary = await c.process()
        XCTAssertEqual(summary.failed, 1)
        let phase422 = await c.capture(id: id)?.phase
        XCTAssertEqual(phase422, .failed(reason: "Falta el texto"))
        XCTAssertEqual(notifier.failures, ["Falta el texto"])
        await c.process()
        XCTAssertEqual(sender.requests.count, 1)
        // It is still on disk: nothing is lost.
        XCTAssertEqual(try store.all().count, 1)
    }

    // MARK: Order and pace

    func testFIFOByCreatedAt() async throws {
        let c = queue()
        let base = now.read()
        let third = UUID()
        let first = UUID()
        let second = UUID()
        try await c.enqueue(body, source: .wallet, photo: nil, id: third, capturedAt: base.addingTimeInterval(30))
        try await c.enqueue(body, source: .wallet, photo: nil, id: first, capturedAt: base)
        try await c.enqueue(body, source: .wallet, photo: nil, id: second, capturedAt: base.addingTimeInterval(10))
        await c.process()
        XCTAssertEqual(sender.requests.map(\.externalRef), [first, second, third].map(\.uuidString))
    }

    func testSpacingOf300msBetweenSends() async throws {
        let c = queue(spacing: .milliseconds(300))
        try await c.enqueue(body, source: .wallet, photo: nil)
        try await c.enqueue(body, source: .wallet, photo: nil)
        await c.process()
        let instants = sender.instants
        XCTAssertEqual(instants.count, 2)
        XCTAssertGreaterThanOrEqual(instants[1] - instants[0], .milliseconds(290))
    }

    // MARK: Two phases

    func testAfterUploadingThePhotoItIsDeletedFromDisk() async throws {
        let c = queue()
        let id = UUID()
        try await c.enqueue(body, source: .iosPhoto, photo: photo, id: id)
        XCTAssertEqual(try store.photoBytes(), photo.count)
        let summary = await c.process()
        XCTAssertEqual(summary.sent, 1)
        XCTAssertEqual(sender.uploads.count, 1)
        XCTAssertEqual(sender.uploads.first?.jpeg, photo)
        XCTAssertEqual(sender.uploads.first?.transactionId, 100)
        XCTAssertEqual(try store.photoBytes(), 0)
        let capture = await c.capture(id: id)
        XCTAssertNil(capture?.photoPath)
        guard case .done(let r)? = capture?.phase else { return XCTFail("la captura no quedó hecha") }
        XCTAssertEqual(r.summary, "Gasto de 45000 en D1")
    }

    func testIfAttachmentsFailItStaysPhotoToUploadAndTheNextAttemptOnlyUploads() async throws {
        let c = queue()
        let id = UUID()
        try await c.enqueue(body, source: .iosPhoto, photo: photo, id: id)
        sender.replyToPhoto(.failure(APIError.server(status: 503)))
        await c.process()
        let phaseAfterFailure = await c.capture(id: id)?.phase
        XCTAssertEqual(phaseAfterFailure, .photoToUpload(transactionId: 100))
        XCTAssertEqual(try store.photoBytes(), photo.count)

        now.advance(10)
        await c.process()
        XCTAssertEqual(sender.requests.count, 1, "la fase 1 no se repite")
        XCTAssertEqual(sender.uploads.count, 2)
        guard case .done? = await c.capture(id: id)?.phase else { return XCTFail("la captura no quedó hecha") }
    }

    func testWithPhotoLimitFullEnqueueWithPhotoThrowsAndWithoutPhotoGoesIn() async throws {
        let c = queue(photoLimit: photo.count + 10)
        try await c.enqueue(body, source: .iosPhoto, photo: photo)
        do {
            try await c.enqueue(body, source: .iosPhoto, photo: photo)
            XCTFail("debería lanzar")
        } catch let e as QueueError {
            XCTAssertEqual(e, .photosFull)
        }
        try await c.enqueue(body, source: .wallet, photo: nil)
        let count = await c.all().count
        XCTAssertEqual(count, 2)
    }

    // MARK: Cleanup and state

    func testPurgesDoneOlderThan30Days() async throws {
        let c = queue()
        let old = UUID()
        let recent = UUID()
        let pending = UUID()
        try await c.enqueue(body, source: .wallet, photo: nil, id: old)
        await c.process()
        now.advance(31 * 86_400)
        try await c.enqueue(body, source: .wallet, photo: nil, id: recent)
        await c.process()
        sender.replyToCapture(.failure(APIError.noNetwork(.notConnectedToInternet)))
        try await c.enqueue(body, source: .wallet, photo: nil, id: pending)
        await c.process()
        await c.purge()
        let remaining = Set(await c.all().map(\.id))
        XCTAssertEqual(remaining, [recent, pending])
    }

    func testChangesPublishesTheQueueAfterEachTransitionAndTheBadgeCarriesThePending() async throws {
        let c = queue()
        let reader = Task {
            var seen: [Int] = []
            for await list in c.changes {
                seen.append(list.captures.filter(\.isPending).count)
                if seen.count == 2 { break }
            }
            return seen
        }
        sender.replyToCapture(.failure(APIError.noNetwork(.notConnectedToInternet)))
        try await c.enqueue(body, source: .wallet, photo: nil)
        await c.process()
        // The publication goes through a buffer of one; the reader is given time.
        try await Task.sleep(for: .milliseconds(50))
        await c.process()
        let pendingSeen = await reader.value
        XCTAssertEqual(pendingSeen.first, 1)
        XCTAssertEqual(notifier.badges.first, 1)
        let pendingBefore = await c.pending()
        XCTAssertEqual(pendingBefore, 1)

        now.advance(10)
        await c.process()
        XCTAssertEqual(notifier.badges.last, 0)
        let pendingAfter = await c.pending()
        XCTAssertEqual(pendingAfter, 0)
    }

    func testNotifiesWhenQueuedCapturesAreSent() async throws {
        let c = queue()
        sender.replyToCapture(.failure(APIError.noNetwork(.notConnectedToInternet)))
        try await c.enqueue(body, source: .wallet, photo: nil)
        await c.process()
        XCTAssertEqual(notifier.queueSentCounts, [])
        now.advance(10)
        await c.process()
        XCTAssertEqual(notifier.queueSentCounts, [1])
        XCTAssertEqual(notifier.isRegistered.count, 1)
    }

    func testEditOnlyFailedOrToSendAndDiscardDeletesThePhoto() async throws {
        let c = queue()
        let done = UUID()
        let withPhoto = UUID()
        try await c.enqueue(body, source: .wallet, photo: nil, id: done)
        await c.process()
        do {
            try await c.edit(id: done, body: CaptureBody(text: "x"))
            XCTFail("una hecha no se edita")
        } catch let e as QueueError {
            XCTAssertEqual(e, .notEditable(done))
        }
        try await c.enqueue(body, source: .iosPhoto, photo: photo, id: withPhoto)
        try await c.edit(id: withPhoto, body: CaptureBody(text: "editada"))
        let editedText = await c.capture(id: withPhoto)?.body.text
        XCTAssertEqual(editedText, "editada")
        try await c.discard(id: withPhoto)
        let discarded = await c.capture(id: withPhoto)
        XCTAssertNil(discarded)
        XCTAssertEqual(try store.photoBytes(), 0)
    }
}
