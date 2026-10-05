import Foundation

/// Las fechas de un gasto se escriben en el día de Bogotá, no en el del
/// simulador ni en UTC: un pago a las 23:30 del día 3 es del día 3.
enum BogotaDate {
    static let timeZone = TimeZone(identifier: "America/Bogota") ?? TimeZone(secondsFromGMT: -5 * 3600) ?? .current

    /// `YYYY-MM-DD` en America/Bogota.
    static func day(_ instant: Date, calendar: Calendar = .init(identifier: .gregorian)) -> String {
        let parts = components(instant, calendar: calendar)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// `YYYY-MM` en America/Bogota.
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
