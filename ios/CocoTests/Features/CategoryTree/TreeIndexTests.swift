import XCTest

@testable import Coco

/// Paridad con `frontend/src/lib/buscar-en-arbol.test.ts`: mismo fixture,
/// mismos resultados. Si una prueba cambia allí, cambia aquí.
final class TreeIndexTests: XCTestCase {
    private static let arbol: [TreeNode] = [
        TreeNode(
            id: 1, name: "Costos fijos", parent_id: nil, estatico: true,
            children: [
                TreeNode(
                    id: 10, name: "Servicios públicos", parent_id: 1,
                    children: [
                        TreeNode(
                            id: 100, name: "Celsia (Energía)", parent_id: 10, palabras_clave: ["celsia", "epsa"]),
                        TreeNode(
                            id: 101, name: "Aquaoccidente (Agua)", parent_id: 10, palabras_clave: ["acueducto"]),
                    ]),
                TreeNode(
                    id: 11, name: "Educación", parent_id: 1,
                    children: [
                        TreeNode(id: 110, name: "Colegio Tuti", parent_id: 11)
                    ]),
            ]),
        TreeNode(
            id: 2, name: "Costos variables", parent_id: nil,
            children: [
                TreeNode(
                    id: 20, name: "Alimentación", parent_id: 2,
                    children: [
                        TreeNode(
                            id: 200, name: "Mercado", parent_id: 20, palabras_clave: ["D1", "Koba Colombia", "Ara"]),
                        TreeNode(id: 201, name: "Supermercado", parent_id: 20),
                    ]),
                TreeNode(id: 21, name: "Transporte", parent_id: 2, children: []),
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
                id: 1, name: "Centro", parent_id: nil,
                children: [
                    TreeNode(
                        id: 10, name: "Viva", parent_id: 1,
                        children: [
                            TreeNode(id: 100, name: "Archivado", parent_id: 10, is_archived: true),
                            TreeNode(id: 101, name: "Vivo", parent_id: 10),
                        ]),
                    TreeNode(
                        id: 11, name: "Archivada", parent_id: 1, is_archived: true,
                        children: [
                            TreeNode(id: 110, name: "Huérfano", parent_id: 11)
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
                id: 3, name: "Centro", parent_id: nil,
                children: [
                    TreeNode(
                        id: 30, name: "Transporte", parent_id: 3,
                        children: [
                            TreeNode(id: 300, name: "Transporte", parent_id: 30)
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
}
