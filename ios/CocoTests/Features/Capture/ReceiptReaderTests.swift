import XCTest

@testable import Coco

final class ReceiptReaderTests: XCTestCase {
    func testFiltersThePreferredAgainstTheSupported() {
        XCTAssertEqual(
            ReceiptReader.availableLanguages(["es-CO", "es-ES", "en-US"], supported: ["es-ES", "en-US"]),
            ["es-ES", "en-US"])
        XCTAssertEqual(
            ReceiptReader.availableLanguages(["es-CO", "es-ES", "en-US"], supported: ["en-US", "es-CO", "fr-FR"]),
            ["es-CO", "en-US"])
    }

    func testWithNoneSupportedFallsBackToEnglish() {
        XCTAssertEqual(ReceiptReader.availableLanguages(["es-CO", "es-ES"], supported: []), ["en-US"])
    }

    func testLinesComeOutTopToBottom() {
        let text = ReceiptReader.orderedText([
            (text: "TOTAL 45.000", y: 0.2), (text: "D1", y: 0.9), (text: "Leche", y: 0.5),
        ])
        XCTAssertEqual(text, "D1\nLeche\nTOTAL 45.000")
    }

    /// The double the form uses in tests: it answers whatever it is told.
    func testTheDoubleConformsToTheProtocol() async throws {
        let reader = FakeReceiptReader(text: "D1\nTOTAL 45.000")
        let image = try XCTUnwrap(TestImage.square(10).cgImage)
        let text = try await reader.text(from: image)
        XCTAssertEqual(text, "D1\nTOTAL 45.000")
        XCTAssertEqual(reader.reads, 1)
    }
}

// `@unchecked Sendable`: a test double. What changes while the test
// runs goes under `lock`; what is configured is written before using it.
final class FakeReceiptReader: ReceiptTextReader, @unchecked Sendable {
    private let lock = NSLock()
    private(set) var reads = 0
    var text: String
    var error: Error?

    init(text: String, error: Error? = nil) {
        self.text = text
        self.error = error
    }

    func text(from image: CGImage) async throws -> String {
        lock.withLock { reads += 1 }
        if let error { throw error }
        return text
    }
}

enum TestImage {
    static func square(_ side: CGFloat) -> UIImage { image(width: side, height: side) }

    static func image(width: CGFloat, height: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }
}
