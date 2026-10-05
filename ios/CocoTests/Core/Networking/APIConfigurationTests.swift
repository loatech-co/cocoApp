import XCTest

@testable import Coco

final class APIConfigurationTests: XCTestCase {
    private var defaults: UserDefaults = .standard
    private let suiteName = "co.loatech.coco.pruebas.configuracion"

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: suiteName) ?? .standard
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        super.tearDown()
    }

    func testLeeElPlistDelBundleQueSeLePide() {
        let bundle = Bundle(for: APIConfigurationTests.self)
        let c = APIConfiguration.current(bundle: bundle, defaults: defaults)
        XCTAssertEqual(c.base.absoluteString, "https://pruebas.coco.invalid")
        XCTAssertEqual(c.apiV1.absoluteString, "https://pruebas.coco.invalid/api/v1")
    }

    func testElOverrideMandaYRestablecerVuelveAlPlist() throws {
        let bundle = Bundle(for: APIConfigurationTests.self)
        APIConfiguration.save(base: try XCTUnwrap(URL(string: "http://localhost:3000/")), defaults: defaults)
        let local = APIConfiguration.current(bundle: bundle, defaults: defaults)
        XCTAssertEqual(local.base.absoluteString, "http://localhost:3000")
        XCTAssertEqual(local.apiV1.absoluteString, "http://localhost:3000/api/v1")

        APIConfiguration.reset(defaults: defaults)
        XCTAssertEqual(
            APIConfiguration.current(bundle: bundle, defaults: defaults).base.absoluteString,
            "https://pruebas.coco.invalid")
    }

    func testApiV1SinDobleBarra() throws {
        let c = APIConfiguration(base: try XCTUnwrap(URL(string: "https://x.invalid///")))
        XCTAssertEqual(c.apiV1.absoluteString, "https://x.invalid/api/v1")
    }

    func testUnOverrideRotoSeIgnora() {
        defaults.set("no es una url", forKey: APIConfiguration.defaultsKey)
        let c = APIConfiguration.current(bundle: Bundle(for: APIConfigurationTests.self), defaults: defaults)
        XCTAssertEqual(c.base.absoluteString, "https://pruebas.coco.invalid")
    }
}
