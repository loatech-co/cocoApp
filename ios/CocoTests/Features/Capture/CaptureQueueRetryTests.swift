import XCTest

@testable import Coco

/// What is retried, when, and what stays failed for good.
final class CaptureQueueRetryTests: CaptureQueueTestCase {
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
                return XCTFail("\(status) should still be porEnviar")
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
        XCTAssertEqual(sender.requests.count, 2, "waiting for a session is not resent")

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
}
