import XCTest

@testable import Coco

final class AmountParserTests: XCTestCase {
    func testFormatosColombianos() {
        XCTAssertEqual(AmountParser.normalizar("$45.000"), "45000")
        XCTAssertEqual(AmountParser.normalizar("45.000,50"), "45000.50")
        XCTAssertEqual(AmountParser.normalizar("COP 1.200.000"), "1200000")
        XCTAssertEqual(AmountParser.normalizar("45,5"), "45.5")
        XCTAssertEqual(AmountParser.normalizar("1.234"), "1234")
        XCTAssertEqual(AmountParser.normalizar("45000"), "45000")
        XCTAssertEqual(AmountParser.normalizar("$ 0"), "0")
    }

    func testFormatoEn() {
        XCTAssertEqual(AmountParser.normalizar("1,200.50"), "1200.50")
    }

    func testLoQueNoEsUnMonto() {
        XCTAssertNil(AmountParser.normalizar(""))
        XCTAssertNil(AmountParser.normalizar(nil))
        XCTAssertNil(AmountParser.normalizar("abc"))
        // Más de dos decimales no cumple el DTO.
        XCTAssertNil(AmountParser.normalizar("12.345,678"))
    }

    func testCumpleElDTO() throws {
        let regex = try NSRegularExpression(pattern: "^\\d+([.,]\\d{1,2})?$")
        for texto in ["$45.000", "45.000,50", "COP 1.200.000", "45,5", "1,200.50", "$ 0"] {
            let salida = try XCTUnwrap(AmountParser.normalizar(texto))
            XCTAssertEqual(
                regex.numberOfMatches(in: salida, range: NSRange(salida.startIndex..., in: salida)), 1, salida)
        }
    }
}
