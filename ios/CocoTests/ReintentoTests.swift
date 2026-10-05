import XCTest

@testable import Coco

final class ReintentoTests: XCTestCase {
    func testEsperaExactaConAzarMedio() {
        let r = Reintento()
        let esperadas: [Double] = [5, 10, 20, 40, 80, 160, 320, 640, 1280, 2560, 3600, 3600, 3600]
        for (intento, segundos) in esperadas.enumerated() {
            XCTAssertEqual(r.espera(intento: intento, azar: 0.5), .seconds(segundos), "intento \(intento)")
        }
    }

    func testTopeDeUnaHora() {
        XCTAssertEqual(Reintento().espera(intento: 40, azar: 0.5), .seconds(3600))
    }

    func testJitterDentroDelVeintePorCiento() {
        let r = Reintento()
        XCTAssertEqual(r.espera(intento: 1, azar: 0), .seconds(8))
        XCTAssertEqual(r.espera(intento: 1, azar: 1), .seconds(12))
        for _ in 0..<50 {
            let e = r.espera(intento: 2)
            XCTAssertGreaterThanOrEqual(e, .seconds(16))
            XCTAssertLessThanOrEqual(e, .seconds(24))
        }
    }

    func testSinJitterEsExacta() {
        XCTAssertEqual(Reintento(jitter: 0).espera(intento: 3), .seconds(40))
    }
}
