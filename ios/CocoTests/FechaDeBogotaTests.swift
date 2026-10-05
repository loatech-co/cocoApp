import XCTest
@testable import Coco

final class FechaDeBogotaTests: XCTestCase {
    private func instante(_ iso: String) throws -> Date {
        try XCTUnwrap(ISO8601DateFormatter().date(from: iso))
    }

    func testElDiaEsElDeBogotaNoElDeUTC() throws {
        XCTAssertEqual(FechaDeBogota.dia(try instante("2026-10-04T04:30:00Z")), "2026-10-03")
        XCTAssertEqual(FechaDeBogota.dia(try instante("2026-10-04T05:00:00Z")), "2026-10-04")
    }

    func testMes() throws {
        XCTAssertEqual(FechaDeBogota.mes(try instante("2026-10-04T04:30:00Z")), "2026-10")
        XCTAssertEqual(FechaDeBogota.mes(try instante("2026-11-01T04:30:00Z")), "2026-10")
    }

    func testNoDependeDeLaZonaDelCalendario() throws {
        var tokio = Calendar(identifier: .gregorian)
        tokio.timeZone = TimeZone(identifier: "Asia/Tokyo") ?? .current
        XCTAssertEqual(FechaDeBogota.dia(try instante("2026-10-04T04:30:00Z"), calendario: tokio), "2026-10-03")
    }

    func testPesos() {
        XCTAssertEqual(Pesos.formatear("45000"), "$45.000")
        XCTAssertEqual(Pesos.formatear("1200000"), "$1.200.000")
        XCTAssertEqual(Pesos.formatear("45000.50"), "$45.000,50")
        XCTAssertEqual(Pesos.formatear("0"), "$0")
        XCTAssertEqual(Pesos.formatear("45000.00"), "$45.000")
    }
}
