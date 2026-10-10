import UserNotifications
import XCTest

@testable import Coco

// `@unchecked Sendable`: a test double. What changes while the test
// runs goes under `lock`; what is configured is written before using it.
final class FakeNotificationCenter: NotificationCenterClient, @unchecked Sendable {
    private let lock = NSLock()
    private var requests: [UNNotificationRequest] = []
    var isAuthorized = true
    var badge: Int?

    func askAuthorization() async throws -> Bool { isAuthorized }
    func register(categories: Set<UNNotificationCategory>) {}
    func addRequest(_ request: UNNotificationRequest) async throws {
        save(request)
    }
    /// Like the real center: the same id replaces.
    private func save(_ request: UNNotificationRequest) {
        lock.withLock {
            requests.removeAll { $0.identifier == request.identifier }
            requests.append(request)
        }
    }
    func removePending(ids: [String]) {
        lock.withLock { requests.removeAll { ids.contains($0.identifier) } }
    }
    func pending() async -> [UNNotificationRequest] {
        saved()
    }
    private func saved() -> [UNNotificationRequest] {
        lock.withLock { requests }
    }
    func setBadge(_ n: Int) async throws { badge = n }
}

final class NotifierTests: XCTestCase {
    private func result(duplicate: Bool = false, merged: Bool = false, needsReview: Bool = false)
        -> SavedResult
    {
        SavedResult(
            transactionId: 42, summary: "Registrado: $45.000 · Mercado", duplicate: duplicate, merged: merged,
            needsReview: needsReview, finishedAt: .now)
    }

    func testCaptureText() {
        XCTAssertEqual(SystemNotifier.captureText(result()).title, "Gasto registrado")
        XCTAssertEqual(SystemNotifier.captureText(result()).body, "Registrado: $45.000 · Mercado")
        XCTAssertEqual(SystemNotifier.captureText(result(duplicate: true)).title, "Ya estaba registrado")
        XCTAssertEqual(SystemNotifier.captureText(result(merged: true)).title, "Era el mismo pago")
        XCTAssertEqual(
            SystemNotifier.captureText(result(needsReview: true)).body,
            "Registrado: $45.000 · Mercado · por revisar")
    }

    func testScheduleExpiryKeepsASingleRequestWithAFixedId() async throws {
        let center = FakeNotificationCenter()
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let n = SystemNotifier(center: center, clock: { now })
        await n.scheduleExpiry(
            now.addingTimeInterval(5 * 86_400), text: "Vuelve a instalarla desde Xcode con el cable.")
        await n.scheduleExpiry(
            now.addingTimeInterval(3 * 86_400), text: "Vuelve a instalarla desde Xcode con el cable.")
        let pending = await center.pending()
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.identifier, SystemNotifier.expiryId)
        XCTAssertTrue(pending.first?.trigger is UNCalendarNotificationTrigger)
    }

    func testAlreadyExpiredSchedulesNothing() async {
        let center = FakeNotificationCenter()
        let now = Date()
        let n = SystemNotifier(center: center, clock: { now })
        await n.scheduleExpiry(now.addingTimeInterval(-60), text: "x")
        let pending = await center.pending()
        XCTAssertTrue(pending.isEmpty)
    }

    func testCaptureSavedCarriesDestinationAndQueueSentCounts() async {
        let center = FakeNotificationCenter()
        let n = SystemNotifier(center: center)
        await n.captureSaved(result(), source: .sms)
        await n.queueSent(count: 3)
        await n.queueSent(count: 0)
        let pending = await center.pending()
        XCTAssertEqual(pending.count, 2)
        XCTAssertEqual(pending.first?.content.userInfo["destination"] as? String, "coco://captures")
        XCTAssertEqual(pending.last?.content.body, "Se enviaron 3 capturas pendientes")
        await n.setBadge(2)
        XCTAssertEqual(center.badge, 2)
    }
}
