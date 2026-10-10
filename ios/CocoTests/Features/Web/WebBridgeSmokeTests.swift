import WebKit
import XCTest

@testable import Coco

/// The bridge end to end: the built web (`frontend/dist`) inside the
/// real `WebBridge`, served locally.
///
/// It checks what no test of a single half sees: that the embedded web
/// asks for the session through `cocoSession`, accepts it and publishes in `window.__coco`
/// exactly what the app calls; and that a notice from the app (`captured`) arrives and
/// makes the web ask for its data again.
///
/// Without the built web it is skipped (`npm run build --workspace frontend`); the
/// copy is made by `scripts/copy-web-for-tests.sh`.
@MainActor
final class WebBridgeSmokeTests: XCTestCase {
    func testTheBuiltWebGreetsTheAppAndHearsItsNotices() async throws {
        let dist = try XCTUnwrap(Bundle(for: Self.self).resourceURL).appending(path: "Web/dist")
        guard FileManager.default.fileExists(atPath: dist.appending(path: "index.html").path) else {
            throw XCTSkip("La web no está construida: npm run build --workspace frontend")
        }
        let server = try StaticWebServer(root: dist)
        let base = try await server.start()
        defer { server.stop() }

        let session = SessionDouble()
        let bridge = WebBridge(
            session: session, configuration: APIConfiguration(base: base), navigation: NavigationDouble(),
            version: "0.1.0", openExternal: { _ in })
        bridge.loadHome()

        // The handshake: the web asks for the session, keeps it and mounts the shell, which
        // is what publishes `window.__coco`.
        let members = try await poll(seconds: 20) {
            let js = "window.__coco ? Object.keys(window.__coco).sort().join(',') : ''"
            let keys = try? await bridge.webView.evaluateJavaScript(js) as? String
            return keys?.isEmpty == false ? keys : nil
        }
        let expected = (WebFunction.allCases.map(\.rawValue) + WebNotice.allCases.map(\.rawValue)).sorted()
        XCTAssertEqual(members?.split(separator: ",").map(String.init), expected)
        XCTAssertGreaterThan(session.tokenReads, 0, "la sesión salió de la app")

        // The notice: what the web asked for so far, and what it asks for again
        // after `captured`.
        let before = try await settledCount(server)
        XCTAssertGreaterThan(before, 0, "la web pidió sus datos con la sesión de la app")
        let delivered = await bridge.notify(.captured)
        XCTAssertTrue(delivered)
        let after = try await poll(seconds: 10) { server.apiRequests.count > before ? server.apiRequests.count : nil }
        XCTAssertNotNil(after, "después de `captured` la web volvió a pedir sus datos")
    }

    /// Repeats `probe` every 100 ms until it returns something, or until `seconds`.
    private func poll<T>(seconds: Double, _ probe: () async throws -> T?) async throws -> T? {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            if let value = try await probe() { return value }
            try await Task.sleep(for: .milliseconds(100))
        }
        return nil
    }

    /// How many requests to the API there were, once it stops growing for 1 s.
    private func settledCount(_ server: StaticWebServer) async throws -> Int {
        var count = -1
        for _ in 0..<20 where server.apiRequests.count != count {
            count = server.apiRequests.count
            try await Task.sleep(for: .seconds(1))
        }
        return count
    }
}
