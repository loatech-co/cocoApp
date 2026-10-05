import XCTest
@testable import Coco

final class LectorDeReciboTests: XCTestCase {
    func testFiltraLosPreferidosContraLosSoportados() {
        XCTAssertEqual(LectorDeRecibo.idiomasDisponibles(["es-CO", "es-ES", "en-US"], soportados: ["es-ES", "en-US"]), ["es-ES", "en-US"])
        XCTAssertEqual(LectorDeRecibo.idiomasDisponibles(["es-CO", "es-ES", "en-US"], soportados: ["en-US", "es-CO", "fr-FR"]), ["es-CO", "en-US"])
    }

    func testSinNingunoSoportadoCaeAIngles() {
        XCTAssertEqual(LectorDeRecibo.idiomasDisponibles(["es-CO", "es-ES"], soportados: []), ["en-US"])
    }

    func testLasLineasSalenDeArribaAbajo() {
        let texto = LectorDeRecibo.ordenar([(texto: "TOTAL 45.000", y: 0.2), (texto: "D1", y: 0.9), (texto: "Leche", y: 0.5)])
        XCTAssertEqual(texto, "D1\nLeche\nTOTAL 45.000")
    }

    /// El doble que usa el formulario en pruebas: responde lo que se le diga.
    func testElDobleCumpleElProtocolo() async throws {
        let lector = LectorFalso(texto: "D1\nTOTAL 45.000")
        let imagen = try XCTUnwrap(ImagenDePrueba.cuadrada(10).cgImage)
        let texto = try await lector.texto(de: imagen)
        XCTAssertEqual(texto, "D1\nTOTAL 45.000")
        XCTAssertEqual(lector.lecturas, 1)
    }
}

final class LectorFalso: LectorDeTextoDeRecibo, @unchecked Sendable {
    private let cerrojo = NSLock()
    private(set) var lecturas = 0
    var texto: String
    var error: Error?

    init(texto: String, error: Error? = nil) {
        self.texto = texto
        self.error = error
    }

    func texto(de imagen: CGImage) async throws -> String {
        cerrojo.withLock { lecturas += 1 }
        if let error { throw error }
        return texto
    }
}

enum ImagenDePrueba {
    static func cuadrada(_ lado: CGFloat) -> UIImage { imagen(ancho: lado, alto: lado) }

    static func imagen(ancho: CGFloat, alto: CGFloat) -> UIImage {
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: ancho, height: alto), format: formato).image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: ancho, height: alto))
        }
    }
}
