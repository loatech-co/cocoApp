import Foundation
import UserNotifications

/// What the notifier needs from the notification center: that way it is tested
/// with a fake center, because `UNUserNotificationCenter` cannot be created.
protocol NotificationCenterClient: Sendable {
    func askAuthorization() async throws -> Bool
    func register(categories: Set<UNNotificationCategory>)
    func addRequest(_ request: UNNotificationRequest) async throws
    func removePending(ids: [String])
    func pending() async -> [UNNotificationRequest]
    func setBadge(_ n: Int) async throws
}

extension UNUserNotificationCenter: NotificationCenterClient {
    func askAuthorization() async throws -> Bool {
        try await requestAuthorization(options: [.alert, .sound, .badge])
    }
    func register(categories: Set<UNNotificationCategory>) { setNotificationCategories(categories) }
    func addRequest(_ request: UNNotificationRequest) async throws { try await add(request) }
    func removePending(ids: [String]) { removePendingNotificationRequests(withIdentifiers: ids) }
    func pending() async -> [UNNotificationRequest] { await pendingNotificationRequests() }
    func setBadge(_ n: Int) async throws { try await setBadgeCount(n) }
}

/// Local notifications. Only local: the personal team does not allow APNs and it is not
/// needed, everything that has to be told happens on the phone itself.
struct SystemNotifier: Notifier {
    static let expiryId = "signature-expiry"
    static let captureCategory = "capture"
    static let openAction = "open"
    /// Where a capture's notification leads; the router reads it.
    static let captureDestination = "coco://captures"

    let center: NotificationCenterClient
    let clock: @Sendable () -> Date

    init(
        center: NotificationCenterClient = UNUserNotificationCenter.current(),
        clock: @Sendable @escaping () -> Date = { Date() }
    ) {
        self.center = center
        self.clock = clock
    }

    /// Pure: what is read at a glance. The summary is written by the API.
    static func captureText(_ r: SavedResult) -> (title: String, body: String) {
        let title: String
        if r.duplicate {
            title = L10n.Notifications.captureDuplicate
        } else if r.merged {
            title = L10n.Notifications.captureMerged
        } else {
            title = L10n.Notifications.captureSaved
        }
        let body = r.needsReview ? L10n.Notifications.captureNeedsReview(r.summary) : r.summary
        return (title, body)
    }

    func requestPermission() async -> Bool {
        let openButton = UNNotificationAction(
            identifier: Self.openAction, title: L10n.Notifications.actionOpen, options: [.foreground])
        center.register(categories: [
            UNNotificationCategory(identifier: Self.captureCategory, actions: [openButton], intentIdentifiers: [])
        ])
        return (try? await center.askAuthorization()) ?? false
    }

    func captureSaved(_ r: SavedResult, source: CaptureSource) async {
        let text = Self.captureText(r)
        await show(
            id: "capture-\(r.transactionId)", title: text.title, body: text.body,
            category: Self.captureCategory)
    }

    func captureFailed(reason: String) async {
        await show(
            id: "capture-failed-\(UUID().uuidString)", title: L10n.Notifications.captureFailed, body: reason,
            category: Self.captureCategory)
    }

    func queueSent(count: Int) async {
        guard count > 0 else { return }
        let body = count == 1 ? L10n.Notifications.queueSentOne : L10n.Notifications.queueSentMany(count)
        await show(
            id: "queue-sent", title: L10n.Notifications.queueTitle, body: body, category: Self.captureCategory)
    }

    /// A single notification with a fixed id: scheduling it twice replaces it.
    func scheduleExpiry(_ expiresAt: Date, text: String) async {
        center.removePending(ids: [Self.expiryId])
        let now = clock()
        guard let fireDate = ExpiryReminder.reminderDate(expiresAt: expiresAt, now: now) else { return }
        let content = UNMutableNotificationContent()
        content.title = ExpiryReminder.text(expiresAt: expiresAt, now: fireDate).title
        content.body = text
        content.sound = .default
        let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: fireDate)
        let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
        try? await center.addRequest(
            UNNotificationRequest(identifier: Self.expiryId, content: content, trigger: trigger))
    }

    func setBadge(_ n: Int) async {
        try? await center.setBadge(max(0, n))
    }

    private func show(id: String, title: String, body: String, category: String) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.categoryIdentifier = category
        content.userInfo = ["destination": Self.captureDestination]
        try? await center.addRequest(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }
}
