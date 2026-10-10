import Foundation

/// When, and with what words, to warn that the installation expires.
enum ExpiryReminder {
    /// The day before at 09:00 local time; if less than 24 h remain, in a minute;
    /// if it already expired, nil (that is said with a banner, not with a notification).
    static func reminderDate(expiresAt: Date, now: Date, calendar: Calendar = .current) -> Date? {
        guard expiresAt > now else { return nil }
        let inOneMinute = now.addingTimeInterval(60)
        guard expiresAt.timeIntervalSince(now) >= 24 * 3600 else { return inOneMinute }
        guard let dayBefore = calendar.date(byAdding: .day, value: -1, to: expiresAt),
            let atNine = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: dayBefore)
        else { return inOneMinute }
        // The day before at 09:00 may already have passed (it expires tomorrow in the
        // small hours): then there is no waiting.
        return atNine > now ? atNine : inOneMinute
    }

    static func text(expiresAt: Date, now: Date) -> (title: String, body: String) {
        let days = daysLeft(expiresAt: expiresAt, now: now)
        let when: String
        switch days {
        case ..<0: when = L10n.Reminders.expiryExpired
        case 0: when = L10n.Reminders.expiryToday
        case 1: when = L10n.Reminders.expiryTomorrow
        default: when = L10n.Reminders.expiryInDays(days)
        }
        return (L10n.Reminders.expiryTitle(when), L10n.Reminders.expiryBody)
    }

    /// Calendar days between today and the expiry day: at 23:50 with
    /// expiry at 00:30 it is 1, not 0.
    static func daysLeft(expiresAt: Date, now: Date, calendar: Calendar = .current) -> Int {
        let start = calendar.startOfDay(for: now)
        let end = calendar.startOfDay(for: expiresAt)
        return calendar.dateComponents([.day], from: start, to: end).day ?? 0
    }
}
