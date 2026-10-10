import XCTest

@testable import Coco

/// Parity with the web's `search-in-tree.test.ts` (see `parityPaths`): same
/// fixture, same results. If a test changes there, it changes here.
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

    // MARK: Indexing

    func testFlattensTheThreeLevelsWithTheirPath() throws {
        let market = try XCTUnwrap(index.entry(id: 200))
        XCTAssertEqual(market.level, .concept)
        XCTAssertEqual(market.path, ["Alimentación", "Costos variables"])
        XCTAssertEqual(market.categoryId, 20)
        XCTAssertEqual(market.centerId, 2)
        XCTAssertEqual(market.readablePath, "Alimentación › Costos variables")
        XCTAssertFalse(market.isStatic)
        XCTAssertEqual(index.entries.count, 11)
    }

    func testACategoryOnlyCarriesItsCenterInThePath() throws {
        let food = try XCTUnwrap(index.entry(id: 20))
        XCTAssertEqual(food.level, .category)
        XCTAssertEqual(food.path, ["Costos variables"])
        XCTAssertNil(food.categoryId)
        XCTAssertEqual(food.centerId, 2)
    }

    func testChoosingAConceptFillsCategoryAndCenterAndTellsIfStatic() throws {
        // Choosing «Celsia» has to leave category and center ready without another
        // search, and warn that the center is static.
        let celsia = try XCTUnwrap(index.entry(id: 100))
        XCTAssertEqual(celsia.categoryId, 10)
        XCTAssertEqual(celsia.centerId, 1)
        XCTAssertTrue(celsia.isStatic)
    }

    func testExcludesArchivedAndWhatHangsFromIt() {
        let withArchived = TreeIndex(roots: [
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
        XCTAssertEqual(withArchived.entries.map(\.id), [1, 10, 101])
    }

    // MARK: Searching

    func testFindsByNameIgnoringAccentsAndCase() {
        XCTAssertEqual(index.search("educacion").map(\.name), ["Educación"])
        XCTAssertEqual(index.search("CELSIA").map(\.id), [100])
    }

    func testFindsByKeyword() {
        // It is the reason it exists: what the receipt says is not the name of the
        // concept, it is what someone wrote as a keyword.
        XCTAssertEqual(index.search("d1").map(\.id), [200])
        XCTAssertEqual(index.search("koba").map(\.id), [200])
    }

    func testExactNameBeatsPrefixAndPrefixBeatsContains() {
        XCTAssertEqual(index.search("mercado").map(\.name), ["Mercado", "Supermercado"])
    }

    func testOnEqualMatchTheConceptComesBeforeTheCategory() {
        let withConcept = TreeIndex(roots: [
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
        XCTAssertEqual(withConcept.search("transporte").map(\.level), [.concept, .category])
    }

    func testWithSeveralWordsAllMustMatch() {
        XCTAssertEqual(index.search("mercado d1").map(\.id), [200])
        XCTAssertEqual(index.search("mercado zzz"), [])
    }

    func testEmptyReturnsEmpty() {
        XCTAssertEqual(index.search(""), [])
        XCTAssertEqual(index.search("   "), [])
    }

    func testDoesNotReturnCentersByDefault() {
        XCTAssertEqual(index.search("costos"), [])
        XCTAssertEqual(index.search("costos", levels: [.center]).map(\.name), ["Costos fijos", "Costos variables"])
    }

    func testRespectsTheLimit() {
        XCTAssertEqual(index.search("a", limit: 2).count, 2)
    }

    // MARK: Normalizing

    func testNormalizeMatchesSignatures() {
        XCTAssertEqual(TreeIndex.normalize("Alimentación  Básica"), "alimentacion basica")
        XCTAssertEqual(TreeIndex.normalize("  Celsia (Energía) \n"), "celsia (energia)")
        XCTAssertEqual(
            TreeIndex.normalize("ÑANDÚ"), "nandu",
            "NFD descompone la eñe y la tilde se va, igual que en firmas.ts")
    }

    /// Where the web test has lived. 7.4 moved it from `lib/` to the
    /// transactions feature; both are accepted while branches coexist.
    static let parityPaths = [
        "frontend/src/features/transactions/model/search-in-tree.test.ts",
        "frontend/src/features/transactions/model/buscar-en-arbol.test.ts",
        "frontend/src/lib/buscar-en-arbol.test.ts",
    ]

    /// If the web test moves or is renamed, this parity would be left
    /// pointing at nothing without anyone noticing.
    func testTheWebParityTestStillExists() throws {
        let root = URL(fileURLWithPath: #filePath)
        let repo = (0..<5).reduce(root) { url, _ in url.deletingLastPathComponent() }
        guard FileManager.default.fileExists(atPath: repo.appending(path: "frontend").path) else {
            throw XCTSkip("No está el repo al lado: \(repo.path)")
        }
        let found = Self.parityPaths.contains {
            FileManager.default.fileExists(atPath: repo.appending(path: $0).path)
        }
        XCTAssertTrue(found, "La prueba de paridad de la web no está en \(Self.parityPaths)")
    }
}
