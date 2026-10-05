import XCTest

@testable import Coco

final class PhotoShrinkerTests: XCTestCase {
    func testUnaFotoGrandeSaleA1600DeLadoMayorYEsJPEG() throws {
        let jpeg = try XCTUnwrap(PhotoShrinker.jpeg(TestImage.imagen(ancho: 4000, alto: 3000)))
        let salida = try XCTUnwrap(UIImage(data: jpeg))
        XCTAssertEqual(salida.size.width * salida.scale, 1600)
        XCTAssertEqual(salida.size.height * salida.scale, 1200)
        XCTAssertEqual(jpeg.prefix(2), Data([0xFF, 0xD8]), "cabecera JPEG")
    }

    func testUnaFotoPequenaNoCrece() throws {
        let jpeg = try XCTUnwrap(PhotoShrinker.jpeg(TestImage.imagen(ancho: 800, alto: 600)))
        let salida = try XCTUnwrap(UIImage(data: jpeg))
        XCTAssertEqual(salida.size.width * salida.scale, 800)
        XCTAssertEqual(salida.size.height * salida.scale, 600)
    }

    func testElTamanoDestinoEsProporcional() {
        XCTAssertEqual(
            PhotoShrinker.tamanoDestino(ancho: 3000, alto: 4000, ladoMaximo: 1600), CGSize(width: 1200, height: 1600))
        XCTAssertEqual(
            PhotoShrinker.tamanoDestino(ancho: 100, alto: 50, ladoMaximo: 1600), CGSize(width: 100, height: 50))
    }
}
