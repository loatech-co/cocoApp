import XCTest
@testable import Coco

final class LectorDeMontoTests: XCTestCase {
    func testFormatosColombianos() {
        XCTAssertEqual(LectorDeMonto.normalizar("$45.000"), "45000")
        XCTAssertEqual(LectorDeMonto.normalizar("45.000,50"), "45000.50")
        XCTAssertEqual(LectorDeMonto.normalizar("COP 1.200.000"), "1200000")
        XCTAssertEqual(LectorDeMonto.normalizar("45,5"), "45.5")
        XCTAssertEqual(LectorDeMonto.normalizar("1.234"), "1234")
        XCTAssertEqual(LectorDeMonto.normalizar("45000"), "45000")
        XCTAssertEqual(LectorDeMonto.normalizar("$ 0"), "0")
    }

    func testFormatoEn() {
        XCTAssertEqual(LectorDeMonto.normalizar("1,200.50"), "1200.50")
    }

    func testLoQueNoEsUnMonto() {
        XCTAssertNil(LectorDeMonto.normalizar(""))
        XCTAssertNil(LectorDeMonto.normalizar(nil))
        XCTAssertNil(LectorDeMonto.normalizar("abc"))
        // Más de dos decimales no cumple el DTO.
        XCTAssertNil(LectorDeMonto.normalizar("12.345,678"))
    }

    func testCumpleElDTO() throws {
        let regex = try NSRegularExpression(pattern: "^\\d+([.,]\\d{1,2})?$")
        for texto in ["$45.000", "45.000,50", "COP 1.200.000", "45,5", "1,200.50", "$ 0"] {
            let salida = try XCTUnwrap(LectorDeMonto.normalizar(texto))
            XCTAssertEqual(regex.numberOfMatches(in: salida, range: NSRange(salida.startIndex..., in: salida)), 1, salida)
        }
    }
}
