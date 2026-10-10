import XCTest

@testable import Coco

@MainActor
final class RouterTests: XCTestCase {
    private func url(_ s: String) throws -> URL { try XCTUnwrap(URL(string: s)) }

    func testDestinationOfTheAppURLs() throws {
        XCTAssertEqual(Router.destination(from: try url("coco://capture/manual")), .quickForm(withCamera: false))
        XCTAssertEqual(Router.destination(from: try url("coco://capture")), .quickForm(withCamera: false))
        XCTAssertEqual(Router.destination(from: try url("coco://capture/photo")), .quickForm(withCamera: true))
        XCTAssertEqual(Router.destination(from: try url("COCO://Capture/PHOTO")), .quickForm(withCamera: true))
        XCTAssertEqual(Router.destination(from: try url("coco://captures")), .captures)
        XCTAssertEqual(
            Router.destination(from: try url(SystemNotifier.captureDestination)), .captures,
            "a capture notification leads to the list")
    }

    func testUnknownURLsAreNotDestinations() throws {
        XCTAssertNil(Router.destination(from: try url("coco://other")))
        XCTAssertNil(Router.destination(from: try url("coco://capture/video")))
        XCTAssertNil(Router.destination(from: try url("coco://captures/1")))
        XCTAssertNil(Router.destination(from: try url("https://dev-cocoapp.viteri.me/capture/manual")))
        let e = Router()
        XCTAssertFalse(e.open(url: try url("coco://other")))
        XCTAssertEqual(e.tab, .home)
    }

    func testOpenChangesTheTabAndRenewsTheForm() throws {
        let e = Router()
        let before = e.formRequest.generation
        XCTAssertTrue(e.open(url: try url("coco://capture/photo")))
        XCTAssertEqual(e.tab, .register)
        XCTAssertTrue(e.formRequest.withCamera)
        XCTAssertEqual(e.formRequest.generation, before + 1)

        XCTAssertTrue(e.open(url: try url("coco://capture/manual")))
        XCTAssertFalse(e.formRequest.withCamera)
        XCTAssertEqual(e.formRequest.generation, before + 2, "every request is a new form")

        XCTAssertTrue(e.open(url: try url("coco://captures")))
        XCTAssertEqual(e.tab, .captures)
    }

    func testGoToWebLeavesThePathPendingOnHome() {
        let e = Router()
        e.tab = .more
        e.go(.web(path: "/cost-centers"))
        XCTAssertEqual(e.tab, .home)
        XCTAssertEqual(e.pendingWebPath, "/cost-centers")
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
        XCTAssertNil(e.sheet, "a tab destination dismisses any open sheet")
        XCTAssertEqual(e.tab, .captures)
    }

    func testItIsTheNavigationTheIntentsUse() {
        let e: any Navigation = Router()
        e.go(.quickForm(withCamera: false))
        XCTAssertEqual((e as? Router)?.tab, .register)
    }
}
