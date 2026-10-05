import XCTest

@testable import Coco

/// Paridad con `buscar-en-arbol.test.ts` de la web (ver `parityPaths`): mismo
/// fixture, mismos resultados. Si una prueba cambia allí, cambia aquí.
final class TreeIndexTests: XCTestCase {
    private static let arbol: [TreeNode] = [
        TreeNode(
            id: 1, name: "Costos fijos", parentId: nil, estatico: true,
            children: [
                TreeNode(
                    id: 10, name: "Servicios públicos", parentId: 1,
                    children: [
                        TreeNode(
                            id: 100, name: "Celsia (Energía)", parentId: 10, keywords: ["celsia", "epsa"]),
                        TreeNode(
                            id: 101, name: "Aquaoccidente (Agua)", parentId: 10, keywords: ["acueducto"]),
                    ]),
                TreeNode(
                    id: 11, name: "Educación", parentId: 1,
                    children: [
                        TreeNode(id: 110, name: "Colegio Tuti", parentId: 11)
                    ]),
            ]),
        TreeNode(
            id: 2, name: "Costos variables", parentId: nil,
            children: [
                TreeNode(
                    id: 20, name: "Alimentación", parentId: 2,
                    children: [
                        TreeNode(
                            id: 200, name: "Mercado", parentId: 20, keywords: ["D1", "Koba Colombia", "Ara"]),
                        TreeNode(id: 201, name: "Supermercado", parentId: 20),
                    ]),
                TreeNode(id: 21, name: "Transporte", parentId: 2, children: []),
            ]),
    ]

    private let indice = TreeIndex(raices: arbol)

    // MARK: Indexar

    func testAplanaLosTresNivelesConSuCamino() throws {
        let mercado = try XCTUnwrap(indice.entrada(id: 200))
        XCTAssertEqual(mercado.nivel, .concepto)
        XCTAssertEqual(mercado.ruta, ["Alimentación", "Costos variables"])
        XCTAssertEqual(mercado.categoriaId, 20)
        XCTAssertEqual(mercado.centroId, 2)
        XCTAssertEqual(mercado.rutaLegible, "Alimentación › Costos variables")
        XCTAssertFalse(mercado.estatico)
        XCTAssertEqual(indice.entradas.count, 11)
    }

    func testUnaCategoriaSoloLlevaSuCentroEnElCamino() throws {
        let alimentacion = try XCTUnwrap(indice.entrada(id: 20))
        XCTAssertEqual(alimentacion.nivel, .categoria)
        XCTAssertEqual(alimentacion.ruta, ["Costos variables"])
        XCTAssertNil(alimentacion.categoriaId)
        XCTAssertEqual(alimentacion.centroId, 2)
    }

    func testElegirUnConceptoCompletaCategoriaYCentroYDiceSiEsEstatico() throws {
        // Elegir «Celsia» tiene que dejar listos categoría y centro sin otra
        // búsqueda, y avisar de que el centro es estático.
        let celsia = try XCTUnwrap(indice.entrada(id: 100))
        XCTAssertEqual(celsia.categoriaId, 10)
        XCTAssertEqual(celsia.centroId, 1)
        XCTAssertTrue(celsia.estatico)
    }

    func testExcluyeLoArchivadoYLoQueCuelgaDeEllo() {
        let conArchivados = TreeIndex(raices: [
            TreeNode(
                id: 1, name: "Centro", parentId: nil,
                children: [
                    TreeNode(
                        id: 10, name: "Viva", parentId: 1,
                        children: [
                            TreeNode(id: 100, name: "Archivado", parentId: 10, isArchived: true),
                            TreeNode(id: 101, name: "Vivo", parentId: 10),
                        ]),
                    TreeNode(
                        id: 11, name: "Archivada", parentId: 1, isArchived: true,
                        children: [
                            TreeNode(id: 110, name: "Huérfano", parentId: 11)
                        ]),
                ])
        ])
        XCTAssertEqual(conArchivados.entradas.map(\.id), [1, 10, 101])
    }

    // MARK: Buscar

    func testEncuentraPorNombreSinTildesNiMayusculas() {
        XCTAssertEqual(indice.buscar("educacion").map(\.nombre), ["Educación"])
        XCTAssertEqual(indice.buscar("CELSIA").map(\.id), [100])
    }

    func testEncuentraPorPalabraClave() {
        // Es la razón de que exista: lo que dice el recibo no es el nombre del
        // concepto, es lo que alguien escribió como palabra clave.
        XCTAssertEqual(indice.buscar("d1").map(\.id), [200])
        XCTAssertEqual(indice.buscar("koba").map(\.id), [200])
    }

    func testElNombreExactoGanaAlQueEmpiezaYEseAlQueContiene() {
        XCTAssertEqual(indice.buscar("mercado").map(\.nombre), ["Mercado", "Supermercado"])
    }

    func testAIgualParecidoElConceptoAntesQueLaCategoria() {
        let conConcepto = TreeIndex(raices: [
            TreeNode(
                id: 3, name: "Centro", parentId: nil,
                children: [
                    TreeNode(
                        id: 30, name: "Transporte", parentId: 3,
                        children: [
                            TreeNode(id: 300, name: "Transporte", parentId: 30)
                        ])
                ])
        ])
        XCTAssertEqual(conConcepto.buscar("transporte").map(\.nivel), [.concepto, .categoria])
    }

    func testConVariasPalabrasTodasTienenQueEncontrarse() {
        XCTAssertEqual(indice.buscar("mercado d1").map(\.id), [200])
        XCTAssertEqual(indice.buscar("mercado zzz"), [])
    }

    func testVacioDevuelveVacio() {
        XCTAssertEqual(indice.buscar(""), [])
        XCTAssertEqual(indice.buscar("   "), [])
    }

    func testNoDevuelveCentrosPorDefecto() {
        XCTAssertEqual(indice.buscar("costos"), [])
        XCTAssertEqual(indice.buscar("costos", niveles: [.centro]).map(\.nombre), ["Costos fijos", "Costos variables"])
    }

    func testRespetaElLimite() {
        XCTAssertEqual(indice.buscar("a", limite: 2).count, 2)
    }

    // MARK: Normalizar

    func testNormalizarEsLaDeFirmas() {
        XCTAssertEqual(TreeIndex.normalizar("Alimentación  Básica"), "alimentacion basica")
        XCTAssertEqual(TreeIndex.normalizar("  Celsia (Energía) \n"), "celsia (energia)")
        XCTAssertEqual(
            TreeIndex.normalizar("ÑANDÚ"), "nandu",
            "NFD descompone la eñe y la tilde se va, igual que en firmas.ts")
    }

    /// Dónde ha vivido la prueba de la web. La 7.4 la movió de `lib/` a la
    /// feature de movimientos; se aceptan las dos mientras convivan ramas.
    static let parityPaths = [
        "frontend/src/features/transactions/model/buscar-en-arbol.test.ts",
        "frontend/src/lib/buscar-en-arbol.test.ts",
    ]

    /// Si la prueba de la web se mueve o se renombra, esta paridad se quedaría
    /// apuntando a la nada sin que nadie lo notara.
    func testTheWebParityTestStillExists() throws {
        let raiz = URL(fileURLWithPath: #filePath)
        let repo = (0..<5).reduce(raiz) { url, _ in url.deletingLastPathComponent() }
        guard FileManager.default.fileExists(atPath: repo.appending(path: "frontend").path) else {
            throw XCTSkip("No está el repo al lado: \(repo.path)")
        }
        let encontrada = Self.parityPaths.contains {
            FileManager.default.fileExists(atPath: repo.appending(path: $0).path)
        }
        XCTAssertTrue(encontrada, "La prueba de paridad de la web no está en \(Self.parityPaths)")
    }
}
