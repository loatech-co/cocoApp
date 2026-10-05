import XCTest

@testable import Coco

@MainActor
final class RouterTests: XCTestCase {
    private func url(_ s: String) throws -> URL { try XCTUnwrap(URL(string: s)) }

    func testDestinationOfTheAppURLs() throws {
        XCTAssertEqual(Router.destination(from: try url("coco://capturar/manual")), .quickForm(withCamera: false))
        XCTAssertEqual(Router.destination(from: try url("coco://capturar")), .quickForm(withCamera: false))
        XCTAssertEqual(Router.destination(from: try url("coco://capturar/foto")), .quickForm(withCamera: true))
        XCTAssertEqual(Router.destination(from: try url("COCO://Capturar/FOTO")), .quickForm(withCamera: true))
        XCTAssertEqual(Router.destination(from: try url("coco://capturas")), .captures)
        XCTAssertEqual(
            Router.destination(from: try url(SystemNotifier.captureDestination)), .captures,
            "el aviso de una captura lleva a la lista")
    }

    func testUnknownURLsAreNotDestinations() throws {
        XCTAssertNil(Router.destination(from: try url("coco://otra")))
        XCTAssertNil(Router.destination(from: try url("coco://capturar/video")))
        XCTAssertNil(Router.destination(from: try url("coco://capturas/1")))
        XCTAssertNil(Router.destination(from: try url("https://dev-cocoapp.viteri.me/capturar/manual")))
        let e = Router()
        XCTAssertFalse(e.open(url: try url("coco://otra")))
        XCTAssertEqual(e.tab, .home)
    }

    func testOpenChangesTheTabAndRenewsTheForm() throws {
        let e = Router()
        let before = e.formRequest.generation
        XCTAssertTrue(e.open(url: try url("coco://capturar/foto")))
        XCTAssertEqual(e.tab, .register)
        XCTAssertTrue(e.formRequest.withCamera)
        XCTAssertEqual(e.formRequest.generation, before + 1)

        XCTAssertTrue(e.open(url: try url("coco://capturar/manual")))
        XCTAssertFalse(e.formRequest.withCamera)
        XCTAssertEqual(e.formRequest.generation, before + 2, "cada petición es un formulario nuevo")

        XCTAssertTrue(e.open(url: try url("coco://capturas")))
        XCTAssertEqual(e.tab, .captures)
    }

    func testGoToWebLeavesThePathPendingOnHome() {
        let e = Router()
        e.tab = .more
        e.go(.web(path: "/centros-de-costos"))
        XCTAssertEqual(e.tab, .home)
        XCTAssertEqual(e.pendingWebPath, "/centros-de-costos")
    }

    func testSearchGoesHomeWithTheSearchPending() {
        let e = Router()
        e.tab = .captures
        e.go(.search)
        XCTAssertEqual(e.tab, .home)
        XCTAssertTrue(e.searchPending)
    }

    func testSheetsDoNotChangeTabAndADestinationClosesThem() {
        let e = Router()
        e.tab = .more
        e.go(.settings)
        XCTAssertEqual(e.sheet, .settings)
        XCTAssertEqual(e.tab, .more)
        e.go(.welcome)
        XCTAssertEqual(e.sheet, .welcome)
        e.go(.captures)
        XCTAssertNil(e.sheet, "un destino de pestaña baja la hoja que hubiera")
        XCTAssertEqual(e.tab, .captures)
    }

    func testItIsTheNavigationTheIntentsUse() {
        let e: any Navigation = Router()
        e.go(.quickForm(withCamera: false))
        XCTAssertEqual((e as? Router)?.tab, .register)
    }
}
