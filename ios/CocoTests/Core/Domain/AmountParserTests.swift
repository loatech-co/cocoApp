import XCTest

@testable import Coco

final class AmountParserTests: XCTestCase {
    func testColombianFormats() {
        XCTAssertEqual(AmountParser.normalize("$45.000"), "45000")
        XCTAssertEqual(AmountParser.normalize("45.000,50"), "45000.50")
        XCTAssertEqual(AmountParser.normalize("COP 1.200.000"), "1200000")
        XCTAssertEqual(AmountParser.normalize("45,5"), "45.5")
        XCTAssertEqual(AmountParser.normalize("1.234"), "1234")
        XCTAssertEqual(AmountParser.normalize("45000"), "45000")
        XCTAssertEqual(AmountParser.normalize("$ 0"), "0")
    }

    func testEnglishFormat() {
        XCTAssertEqual(AmountParser.normalize("1,200.50"), "1200.50")
    }

    func testWhatIsNotAnAmount() {
        XCTAssertNil(AmountParser.normalize(""))
        XCTAssertNil(AmountParser.normalize(nil))
        XCTAssertNil(AmountParser.normalize("abc"))
        // Más de dos decimales no cumple el DTO.
        XCTAssertNil(AmountParser.normalize("12.345,678"))
    }

    func testMatchesTheDTO() throws {
        let regex = try NSRegularExpression(pattern: "^\\d+([.,]\\d{1,2})?$")
        for text in ["$45.000", "45.000,50", "COP 1.200.000", "45,5", "1,200.50", "$ 0"] {
            let output = try XCTUnwrap(AmountParser.normalize(text))
            XCTAssertEqual(
                regex.numberOfMatches(in: output, range: NSRange(output.startIndex..., in: output)), 1, output)
        }
    }
}
