import XCTest

@testable import Coco

final class QueuedCapturerTests: XCTestCase {
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

    private func capturer() -> QueuedCapturer {
        let queue = CaptureQueue(
            store: DiskQueueStore(root: root), sender: sender, session: SessionDouble(),
            notifier: notifier, spacing: .zero, shrinkPhoto: { $0 })
        return QueuedCapturer(queue: queue, notifier: notifier)
    }

    private let body = CaptureBody(merchant: "D1", amount: "45000")

    func testSendWithinBudgetReturnsSentAndNotifiesTheSummary() async {
        let r = await capturer().capture(body, source: .wallet, photo: nil, budget: .seconds(10))
        guard case .sent(let g) = r else { return XCTFail("\(r)") }
        XCTAssertEqual(g.summary, "Gasto de 45000 en D1")
        XCTAssertEqual(notifier.isRegistered.map(\.summary), ["Gasto de 45000 en D1"])
        XCTAssertEqual(notifier.failures, [])
    }

    func testWithoutNetworkStaysQueuedWithoutNotifyingAResult() async {
        sender.replyToCapture(.failure(APIError.noNetwork(.notConnectedToInternet)))
        let r = await capturer().capture(body, source: .sms, photo: nil, budget: .seconds(10))
        XCTAssertEqual(r, .queued(pending: 1))
        XCTAssertEqual(notifier.isRegistered, [])
        XCTAssertEqual(notifier.failures, [])
        XCTAssertEqual(try DiskQueueStore(root: root).all().count, 1)
    }

    func testA422ReturnsFailedAndNotifiesTheFailure() async {
        sender.replyToCapture(
            .failure(APIError.rejected(APIProblem(status: 422, code: .validationFailed, detail: "Falta el texto"))))
        let r = await capturer().capture(body, source: .wallet, photo: nil, budget: .seconds(10))
        XCTAssertEqual(r, .failed(reason: "Falta el texto"))
        XCTAssertEqual(notifier.failures, ["Falta el texto"])
    }

    func testTheReducerLeavesThePhotoUnder1600px() throws {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let large = UIGraphicsImageRenderer(size: CGSize(width: 3200, height: 2000), format: format).image { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 3200, height: 2000))
        }
        let png = try XCTUnwrap(large.pngData())
        let jpeg = PhotoReducer.jpeg(png)
        let reduced = try XCTUnwrap(UIImage(data: jpeg))
        XCTAssertEqual(reduced.size.width * reduced.scale, 1600)
        XCTAssertEqual(reduced.size.height * reduced.scale, 1000)
        XCTAssertLessThan(jpeg.count, png.count)
        // Lo que no es imagen pasa tal cual.
        XCTAssertEqual(PhotoReducer.jpeg(Data([1, 2, 3])), Data([1, 2, 3]))
    }
}
