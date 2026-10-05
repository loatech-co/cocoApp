import XCTest

@testable import Coco

final class ExpiryReminderTests: XCTestCase {
    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Bogota") ?? .current
        return c
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ min: Int = 0) throws -> Date {
        try XCTUnwrap(cal.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min)))
    }

    func testExpiringInFiveDaysRemindsTheDayBeforeAtNine() throws {
        let now = try date(2026, 10, 5, 12)
        let expiresAt = try date(2026, 10, 10, 15, 30)
        XCTAssertEqual(
            ExpiryReminder.reminderDate(expiresAt: expiresAt, now: now, calendar: cal), try date(2026, 10, 9, 9))
    }

    func testExpiringInTenHoursRemindsInOneMinute() throws {
        let now = try date(2026, 10, 5, 12)
        let expiresAt = now.addingTimeInterval(10 * 3600)
        XCTAssertEqual(
            ExpiryReminder.reminderDate(expiresAt: expiresAt, now: now, calendar: cal),
            now.addingTimeInterval(60))
    }

    func testDayBeforeAlreadyPassedRemindsInOneMinute() throws {
        // Vence mañana a las 02:00; la víspera a las 09:00 ya quedó atrás.
        let now = try date(2026, 10, 5, 20)
        let expiresAt = try date(2026, 10, 6, 2)
        XCTAssertEqual(
            ExpiryReminder.reminderDate(expiresAt: expiresAt, now: now, calendar: cal),
            now.addingTimeInterval(60))
    }

    func testAlreadyExpiredIsNil() throws {
        XCTAssertNil(
            ExpiryReminder.reminderDate(
                expiresAt: try date(2026, 10, 1), now: try date(2026, 10, 5), calendar: cal))
    }

    func testDaysLeftAtTheMidnightEdge() throws {
        XCTAssertEqual(
            ExpiryReminder.daysLeft(
                expiresAt: try date(2026, 10, 6, 0, 30), now: try date(2026, 10, 5, 23, 50), calendar: cal), 1)
        XCTAssertEqual(
            ExpiryReminder.daysLeft(
                expiresAt: try date(2026, 10, 5, 23, 59), now: try date(2026, 10, 5, 0, 1), calendar: cal), 0)
        XCTAssertEqual(
            ExpiryReminder.daysLeft(
                expiresAt: try date(2026, 10, 12), now: try date(2026, 10, 5, 23), calendar: cal), 7)
    }

    func testTextsInSpanishWithoutAllCaps() throws {
        let t = ExpiryReminder.text(expiresAt: try date(2026, 10, 6, 12), now: try date(2026, 10, 5, 12))
        XCTAssertEqual(t.title, "Tu instalación de Coco caduca mañana")
        XCTAssertEqual(t.body, "Vuelve a instalarla desde Xcode con el cable.")
        for text in [t.title, t.body] {
            XCTAssertNotEqual(text, text.uppercased())
        }
    }
}
