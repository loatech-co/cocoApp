import WebKit
import XCTest

@testable import Coco

/// El puente de punta a punta: la web construida (`frontend/dist`) dentro del
/// `WebBridge` real, servida en local.
///
/// Comprueba lo que ninguna prueba de una sola mitad ve: que la web embebida
/// pide la sesión por `cocoSession`, la acepta y publica en `window.__coco`
/// justo lo que la app llama; y que un aviso de la app (`captured`) llega y
/// hace que la web vuelva a pedir sus datos.
///
/// Sin la web construida se salta (`npm run build --workspace frontend`); la
/// copia la hace `scripts/copy-web-for-tests.sh`.
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

        // El saludo: la web pide la sesión, la guarda y monta el armazón, que
        // es quien publica `window.__coco`.
        let members = try await poll(seconds: 20) {
            let js = "window.__coco ? Object.keys(window.__coco).sort().join(',') : ''"
            let keys = try? await bridge.webView.evaluateJavaScript(js) as? String
            return keys?.isEmpty == false ? keys : nil
        }
        let expected = (WebFunction.allCases.map(\.rawValue) + WebNotice.allCases.map(\.rawValue)).sorted()
        XCTAssertEqual(members?.split(separator: ",").map(String.init), expected)
        XCTAssertGreaterThan(session.tokenReads, 0, "la sesión salió de la app")

        // El aviso: lo que la web pidió hasta ahora, y lo que vuelve a pedir
        // después de `captured`.
        let before = try await settledCount(server)
        XCTAssertGreaterThan(before, 0, "la web pidió sus datos con la sesión de la app")
        let delivered = await bridge.notify(.captured)
        XCTAssertTrue(delivered)
        let after = try await poll(seconds: 10) { server.apiRequests.count > before ? server.apiRequests.count : nil }
        XCTAssertNotNil(after, "después de `captured` la web volvió a pedir sus datos")
    }

    /// Repite `probe` cada 100 ms hasta que devuelve algo, o hasta `seconds`.
    private func poll<T>(seconds: Double, _ probe: () async throws -> T?) async throws -> T? {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            if let value = try await probe() { return value }
            try await Task.sleep(for: .milliseconds(100))
        }
        return nil
    }

    /// Cuántas peticiones a la API hubo, cuando deja de crecer durante 1 s.
    private func settledCount(_ server: StaticWebServer) async throws -> Int {
        var count = -1
        for _ in 0..<20 where server.apiRequests.count != count {
            count = server.apiRequests.count
            try await Task.sleep(for: .seconds(1))
        }
        return count
    }
}
