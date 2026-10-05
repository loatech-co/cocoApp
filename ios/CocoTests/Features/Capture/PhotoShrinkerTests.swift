import XCTest

@testable import Coco

final class PhotoShrinkerTests: XCTestCase {
    func testALargePhotoComesOutAt1600OnTheLongSideAndIsJPEG() throws {
        let jpeg = try XCTUnwrap(PhotoShrinker.jpeg(TestImage.image(width: 4000, height: 3000)))
        let output = try XCTUnwrap(UIImage(data: jpeg))
        XCTAssertEqual(output.size.width * output.scale, 1600)
        XCTAssertEqual(output.size.height * output.scale, 1200)
        XCTAssertEqual(jpeg.prefix(2), Data([0xFF, 0xD8]), "cabecera JPEG")
    }

    func testASmallPhotoDoesNotGrow() throws {
        let jpeg = try XCTUnwrap(PhotoShrinker.jpeg(TestImage.image(width: 800, height: 600)))
        let output = try XCTUnwrap(UIImage(data: jpeg))
        XCTAssertEqual(output.size.width * output.scale, 800)
        XCTAssertEqual(output.size.height * output.scale, 600)
    }

    func testTheTargetSizeIsProportional() {
        XCTAssertEqual(
            PhotoShrinker.targetSize(width: 3000, height: 4000, maxSide: 1600), CGSize(width: 1200, height: 1600))
        XCTAssertEqual(
            PhotoShrinker.targetSize(width: 100, height: 50, maxSide: 1600), CGSize(width: 100, height: 50))
    }
}
