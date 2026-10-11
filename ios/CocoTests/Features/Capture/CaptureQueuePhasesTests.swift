import XCTest

@testable import Coco

/// The two phases of a capture with a photo, cleanup and what is published.
final class CaptureQueuePhasesTests: CaptureQueueTestCase {
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
        guard case .done(let r)? = capture?.phase else { return XCTFail("the capture did not end up done") }
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
        XCTAssertEqual(sender.requests.count, 1, "phase 1 is not repeated")
        XCTAssertEqual(sender.uploads.count, 2)
        guard case .done? = await c.capture(id: id)?.phase else { return XCTFail("the capture did not end up done") }
    }

    func testWithPhotoLimitFullEnqueueWithPhotoThrowsAndWithoutPhotoGoesIn() async throws {
        let c = queue(photoLimit: photo.count + 10)
        try await c.enqueue(body, source: .iosPhoto, photo: photo)
        do {
            try await c.enqueue(body, source: .iosPhoto, photo: photo)
            XCTFail("it should throw")
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
            XCTFail("a done one is not edited")
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
