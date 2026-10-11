import XCTest

@testable import Coco

/// Persistence, idempotency, order and pace.
final class CaptureQueueTests: CaptureQueueTestCase {
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
        guard case .done(let r)? = await c.capture(id: id)?.phase else { return XCTFail("it did not end up done") }
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
        guard case .toSend? = await c.capture(id: id)?.phase else { return XCTFail("it should still be porEnviar") }

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
}
