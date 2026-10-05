import XCTest

@testable import Coco

final class RecentConceptsTests: XCTestCase {
    func testElNuevoVaPrimeroSinRepetirse() {
        XCTAssertEqual(RecentConcepts.agregar(3, to: [1, 2, 3]), [3, 1, 2])
        XCTAssertEqual(RecentConcepts.agregar(9, to: [1, 2]), [9, 1, 2])
    }

    func testSeCortaAlTope() {
        XCTAssertEqual(RecentConcepts.agregar(6, to: [1, 2, 3, 4, 5]), [6, 1, 2, 3, 4])
        XCTAssertEqual(RecentConcepts.agregar(6, to: [1, 2, 3, 4, 5], tope: 2), [6, 1])
    }

    func testElAlmacenGuardaYLeeEnOrden() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "recientes-\(UUID().uuidString)"))
        let almacen = RecentsStore(defaults: defaults)
        XCTAssertEqual(almacen.read(), [])
        almacen.anotar(1)
        almacen.anotar(2)
        almacen.anotar(1)
        XCTAssertEqual(almacen.read(), [1, 2])
    }
}
