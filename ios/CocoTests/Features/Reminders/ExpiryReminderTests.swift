import XCTest

@testable import Coco

final class ExpiryReminderTests: XCTestCase {
    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Bogota") ?? .current
        return c
    }

    private func fecha(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ min: Int = 0) throws -> Date {
        try XCTUnwrap(cal.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min)))
    }

    func testVenceEnCincoDiasAvisaLaVisperaALasNueve() throws {
        let ahora = try fecha(2026, 10, 5, 12)
        let vence = try fecha(2026, 10, 10, 15, 30)
        XCTAssertEqual(
            ExpiryReminder.momentoDelAviso(vence: vence, ahora: ahora, calendario: cal), try fecha(2026, 10, 9, 9))
    }

    func testVenceEnDiezHorasAvisaEnUnMinuto() throws {
        let ahora = try fecha(2026, 10, 5, 12)
        let vence = ahora.addingTimeInterval(10 * 3600)
        XCTAssertEqual(
            ExpiryReminder.momentoDelAviso(vence: vence, ahora: ahora, calendario: cal),
            ahora.addingTimeInterval(60))
    }

    func testVisperaYaPasadaAvisaEnUnMinuto() throws {
        // Vence mañana a las 02:00; la víspera a las 09:00 ya quedó atrás.
        let ahora = try fecha(2026, 10, 5, 20)
        let vence = try fecha(2026, 10, 6, 2)
        XCTAssertEqual(
            ExpiryReminder.momentoDelAviso(vence: vence, ahora: ahora, calendario: cal),
            ahora.addingTimeInterval(60))
    }

    func testYaVencidoNil() throws {
        XCTAssertNil(
            ExpiryReminder.momentoDelAviso(
                vence: try fecha(2026, 10, 1), ahora: try fecha(2026, 10, 5), calendario: cal))
    }

    func testDiasRestantesEnElBordeDeMedianoche() throws {
        XCTAssertEqual(
            ExpiryReminder.diasRestantes(
                vence: try fecha(2026, 10, 6, 0, 30), ahora: try fecha(2026, 10, 5, 23, 50), calendario: cal), 1)
        XCTAssertEqual(
            ExpiryReminder.diasRestantes(
                vence: try fecha(2026, 10, 5, 23, 59), ahora: try fecha(2026, 10, 5, 0, 1), calendario: cal), 0)
        XCTAssertEqual(
            ExpiryReminder.diasRestantes(
                vence: try fecha(2026, 10, 12), ahora: try fecha(2026, 10, 5, 23), calendario: cal), 7)
    }

    func testTextosEnEspanolSinMayusculasSostenidas() throws {
        let t = ExpiryReminder.texto(vence: try fecha(2026, 10, 6, 12), ahora: try fecha(2026, 10, 5, 12))
        XCTAssertEqual(t.titulo, "Tu instalación de Coco caduca mañana")
        XCTAssertEqual(t.cuerpo, "Vuelve a instalarla desde Xcode con el cable.")
        for texto in [t.titulo, t.cuerpo] {
            XCTAssertNotEqual(texto, texto.uppercased())
        }
    }
}
