import XCTest

@testable import Coco

final class RecentConceptsTests: XCTestCase {
    func testTheNewOneGoesFirstWithoutRepeating() {
        XCTAssertEqual(RecentConcepts.adding(3, to: [1, 2, 3]), [3, 1, 2])
        XCTAssertEqual(RecentConcepts.adding(9, to: [1, 2]), [9, 1, 2])
    }

    func testIsCutAtTheLimit() {
        XCTAssertEqual(RecentConcepts.adding(6, to: [1, 2, 3, 4, 5]), [6, 1, 2, 3, 4])
        XCTAssertEqual(RecentConcepts.adding(6, to: [1, 2, 3, 4, 5], limit: 2), [6, 1])
    }

    func testTheStoreSavesAndReadsInOrder() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "recientes-\(UUID().uuidString)"))
        let store = RecentsStore(defaults: defaults)
        XCTAssertEqual(store.read(), [])
        store.record(1)
        store.record(2)
        store.record(1)
        XCTAssertEqual(store.read(), [1, 2])
    }
}
