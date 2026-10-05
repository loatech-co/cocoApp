import XCTest

@testable import Coco

final class ConceptosRecientesTests: XCTestCase {
    func testElNuevoVaPrimeroSinRepetirse() {
        XCTAssertEqual(ConceptosRecientes.agregar(3, a: [1, 2, 3]), [3, 1, 2])
        XCTAssertEqual(ConceptosRecientes.agregar(9, a: [1, 2]), [9, 1, 2])
    }

    func testSeCortaAlTope() {
        XCTAssertEqual(ConceptosRecientes.agregar(6, a: [1, 2, 3, 4, 5]), [6, 1, 2, 3, 4])
        XCTAssertEqual(ConceptosRecientes.agregar(6, a: [1, 2, 3, 4, 5], tope: 2), [6, 1])
    }

    func testElAlmacenGuardaYLeeEnOrden() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "recientes-\(UUID().uuidString)"))
        let almacen = AlmacenDeRecientes(defaults: defaults)
        XCTAssertEqual(almacen.leer(), [])
        almacen.anotar(1)
        almacen.anotar(2)
        almacen.anotar(1)
        XCTAssertEqual(almacen.leer(), [1, 2])
    }
}
