import XCTest

@testable import Coco

/// Paridad con `buscar-en-arbol.test.ts` de la web (ver `parityPaths`): mismo
/// fixture, mismos resultados. Si una prueba cambia allí, cambia aquí.
final class TreeIndexTests: XCTestCase {
    private static let tree: [TreeNode] = [
        TreeNode(
            id: 1, name: "Costos fijos", parentId: nil, isStatic: true,
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

    private let index = TreeIndex(roots: tree)

    // MARK: Indexar

    func testAplanaLosTresNivelesConSuCamino() throws {
        let mercado = try XCTUnwrap(index.entry(id: 200))
        XCTAssertEqual(mercado.nivel, .concept)
        XCTAssertEqual(mercado.path, ["Alimentación", "Costos variables"])
        XCTAssertEqual(mercado.categoriaId, 20)
        XCTAssertEqual(mercado.centroId, 2)
        XCTAssertEqual(mercado.rutaLegible, "Alimentación › Costos variables")
        XCTAssertFalse(mercado.isStatic)
        XCTAssertEqual(index.entradas.count, 11)
    }

    func testUnaCategoriaSoloLlevaSuCentroEnElCamino() throws {
        let alimentacion = try XCTUnwrap(index.entry(id: 20))
        XCTAssertEqual(alimentacion.nivel, .categoria)
        XCTAssertEqual(alimentacion.path, ["Costos variables"])
        XCTAssertNil(alimentacion.categoriaId)
        XCTAssertEqual(alimentacion.centroId, 2)
    }

    func testElegirUnConceptoCompletaCategoriaYCentroYDiceSiEsEstatico() throws {
        // Elegir «Celsia» tiene que dejar listos categoría y centro sin otra
        // búsqueda, y avisar de que el centro es estático.
        let celsia = try XCTUnwrap(index.entry(id: 100))
        XCTAssertEqual(celsia.categoriaId, 10)
        XCTAssertEqual(celsia.centroId, 1)
        XCTAssertTrue(celsia.isStatic)
    }

    func testExcluyeLoArchivadoYLoQueCuelgaDeEllo() {
        let conArchivados = TreeIndex(roots: [
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
        XCTAssertEqual(index.search("educacion").map(\.name), ["Educación"])
        XCTAssertEqual(index.search("CELSIA").map(\.id), [100])
    }

    func testEncuentraPorPalabraClave() {
        // Es la razón de que exista: lo que dice el recibo no es el nombre del
        // concepto, es lo que alguien escribió como palabra clave.
        XCTAssertEqual(index.search("d1").map(\.id), [200])
        XCTAssertEqual(index.search("koba").map(\.id), [200])
    }

    func testElNombreExactoGanaAlQueEmpiezaYEseAlQueContiene() {
        XCTAssertEqual(index.search("mercado").map(\.name), ["Mercado", "Supermercado"])
    }

    func testAIgualParecidoElConceptoAntesQueLaCategoria() {
        let conConcepto = TreeIndex(roots: [
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
        XCTAssertEqual(conConcepto.search("transporte").map(\.nivel), [.concept, .categoria])
    }

    func testConVariasPalabrasTodasTienenQueEncontrarse() {
        XCTAssertEqual(index.search("mercado d1").map(\.id), [200])
        XCTAssertEqual(index.search("mercado zzz"), [])
    }

    func testVacioDevuelveVacio() {
        XCTAssertEqual(index.search(""), [])
        XCTAssertEqual(index.search("   "), [])
    }

    func testNoDevuelveCentrosPorDefecto() {
        XCTAssertEqual(index.search("costos"), [])
        XCTAssertEqual(index.search("costos", niveles: [.centro]).map(\.name), ["Costos fijos", "Costos variables"])
    }

    func testRespetaElLimite() {
        XCTAssertEqual(index.search("a", limit: 2).count, 2)
    }

    // MARK: Normalizar

    func testNormalizarEsLaDeFirmas() {
        XCTAssertEqual(TreeIndex.normalize("Alimentación  Básica"), "alimentacion basica")
        XCTAssertEqual(TreeIndex.normalize("  Celsia (Energía) \n"), "celsia (energia)")
        XCTAssertEqual(
            TreeIndex.normalize("ÑANDÚ"), "nandu",
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
        let root = URL(fileURLWithPath: #filePath)
        let repo = (0..<5).reduce(root) { url, _ in url.deletingLastPathComponent() }
        guard FileManager.default.fileExists(atPath: repo.appending(path: "frontend").path) else {
            throw XCTSkip("No está el repo al lado: \(repo.path)")
        }
        let encontrada = Self.parityPaths.contains {
            FileManager.default.fileExists(atPath: repo.appending(path: $0).path)
        }
        XCTAssertTrue(encontrada, "La prueba de paridad de la web no está en \(Self.parityPaths)")
    }
}
