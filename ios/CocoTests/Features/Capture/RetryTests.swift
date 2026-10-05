import XCTest

@testable import Coco

final class RetryTests: XCTestCase {
    func testExactDelayWithMidRandom() {
        let r = Retry()
        let expected: [Double] = [5, 10, 20, 40, 80, 160, 320, 640, 1280, 2560, 3600, 3600, 3600]
        for (attempt, seconds) in expected.enumerated() {
            XCTAssertEqual(r.delay(attempt: attempt, random: 0.5), .seconds(seconds), "intento \(attempt)")
        }
    }

    func testCapOfOneHour() {
        XCTAssertEqual(Retry().delay(attempt: 40, random: 0.5), .seconds(3600))
    }

    func testJitterWithinTwentyPercent() {
        let r = Retry()
        XCTAssertEqual(r.delay(attempt: 1, random: 0), .seconds(8))
        XCTAssertEqual(r.delay(attempt: 1, random: 1), .seconds(12))
        for _ in 0..<50 {
            let e = r.delay(attempt: 2)
            XCTAssertGreaterThanOrEqual(e, .seconds(16))
            XCTAssertLessThanOrEqual(e, .seconds(24))
        }
    }

    func testWithoutJitterIsExact() {
        XCTAssertEqual(Retry(jitter: 0).delay(attempt: 3), .seconds(40))
    }
}
