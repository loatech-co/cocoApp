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

    func testVenceEnCincoDiasAvisaLaVisperaALasNueve() throws {
        let now = try date(2026, 10, 5, 12)
        let expiresAt = try date(2026, 10, 10, 15, 30)
        XCTAssertEqual(
            ExpiryReminder.momentoDelAviso(expiresAt: expiresAt, now: now, calendar: cal), try date(2026, 10, 9, 9))
    }

    func testVenceEnDiezHorasAvisaEnUnMinuto() throws {
        let now = try date(2026, 10, 5, 12)
        let expiresAt = now.addingTimeInterval(10 * 3600)
        XCTAssertEqual(
            ExpiryReminder.momentoDelAviso(expiresAt: expiresAt, now: now, calendar: cal),
            now.addingTimeInterval(60))
    }

    func testVisperaYaPasadaAvisaEnUnMinuto() throws {
        // Vence mañana a las 02:00; la víspera a las 09:00 ya quedó atrás.
        let now = try date(2026, 10, 5, 20)
        let expiresAt = try date(2026, 10, 6, 2)
        XCTAssertEqual(
            ExpiryReminder.momentoDelAviso(expiresAt: expiresAt, now: now, calendar: cal),
            now.addingTimeInterval(60))
    }

    func testYaVencidoNil() throws {
        XCTAssertNil(
            ExpiryReminder.momentoDelAviso(
                expiresAt: try date(2026, 10, 1), now: try date(2026, 10, 5), calendar: cal))
    }

    func testDiasRestantesEnElBordeDeMedianoche() throws {
        XCTAssertEqual(
            ExpiryReminder.diasRestantes(
                expiresAt: try date(2026, 10, 6, 0, 30), now: try date(2026, 10, 5, 23, 50), calendar: cal), 1)
        XCTAssertEqual(
            ExpiryReminder.diasRestantes(
                expiresAt: try date(2026, 10, 5, 23, 59), now: try date(2026, 10, 5, 0, 1), calendar: cal), 0)
        XCTAssertEqual(
            ExpiryReminder.diasRestantes(
                expiresAt: try date(2026, 10, 12), now: try date(2026, 10, 5, 23), calendar: cal), 7)
    }

    func testTextosEnEspanolSinMayusculasSostenidas() throws {
        let t = ExpiryReminder.text(expiresAt: try date(2026, 10, 6, 12), now: try date(2026, 10, 5, 12))
        XCTAssertEqual(t.titulo, "Tu instalación de Coco caduca mañana")
        XCTAssertEqual(t.body, "Vuelve a instalarla desde Xcode con el cable.")
        for text in [t.titulo, t.body] {
            XCTAssertNotEqual(text, text.uppercased())
        }
    }
}
