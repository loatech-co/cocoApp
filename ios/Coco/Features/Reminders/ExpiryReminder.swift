import Foundation

/// Cuándo y con qué palabras avisar de que la instalación caduca.
enum ExpiryReminder {
    /// La víspera a las 09:00 locales; si faltan menos de 24 h, en un minuto;
    /// si ya venció, nil (eso se dice con un cartel, no con un aviso).
    static func reminderDate(expiresAt: Date, now: Date, calendar: Calendar = .current) -> Date? {
        guard expiresAt > now else { return nil }
        let inOneMinute = now.addingTimeInterval(60)
        guard expiresAt.timeIntervalSince(now) >= 24 * 3600 else { return inOneMinute }
        guard let dayBefore = calendar.date(byAdding: .day, value: -1, to: expiresAt),
            let atNine = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: dayBefore)
        else { return inOneMinute }
        // La víspera a las 09:00 puede haber pasado ya (vence mañana de
        // madrugada): entonces no se espera.
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

    /// Días de calendario entre hoy y el día del vencimiento: a las 23:50 con
    /// vencimiento a las 00:30 queda 1, no 0.
    static func daysLeft(expiresAt: Date, now: Date, calendar: Calendar = .current) -> Int {
        let start = calendar.startOfDay(for: now)
        let end = calendar.startOfDay(for: expiresAt)
        return calendar.dateComponents([.day], from: start, to: end).day ?? 0
    }
}
