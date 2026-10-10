import Foundation

/// The dates of an expense are written in Bogotá's day, not in the
/// simulator's nor in UTC: a payment at 23:30 on the 3rd belongs to the 3rd.
enum BogotaDate {
    static let timeZone = TimeZone(identifier: "America/Bogota") ?? TimeZone(secondsFromGMT: -5 * 3600) ?? .current

    /// `YYYY-MM-DD` in America/Bogota.
    static func day(_ instant: Date, calendar: Calendar = .init(identifier: .gregorian)) -> String {
        let parts = components(instant, calendar: calendar)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// `YYYY-MM` in America/Bogota.
    static func month(_ instant: Date, calendar: Calendar = .init(identifier: .gregorian)) -> String {
        let parts = components(instant, calendar: calendar)
        return String(format: "%04d-%02d", parts.year ?? 0, parts.month ?? 0)
    }

    private static func components(_ instant: Date, calendar: Calendar) -> DateComponents {
        var cal = calendar
        cal.timeZone = timeZone
        return cal.dateComponents([.year, .month, .day], from: instant)
    }
}
