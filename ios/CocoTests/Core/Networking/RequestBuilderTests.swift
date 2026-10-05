import XCTest

@testable import Coco

final class RequestBuilderTests: XCTestCase {
    private let base = URL(string: "https://api.coco.invalid/api/v1") ?? URL(fileURLWithPath: "/")
    private let ua = Brand.userAgent(version: "0.1.0", system: "17.0")

    private func armar(_ p: APIRequest, token: String? = nil) -> URLRequest {
        RequestBuilder.urlRequest(p, base: base, token: token, userAgent: ua)
    }

    private func body(_ r: URLRequest) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(r.httpBody)) as? [String: Any])
    }

    func testLoginRefreshYLogoutSonNativosYSinQuery() throws {
        let login = armar(RequestBuilder.login(email: "g@x.co", password: "s3creto"))
        XCTAssertEqual(login.url?.absoluteString, "https://api.coco.invalid/api/v1/auth/login")
        XCTAssertEqual(login.httpMethod, "POST")
        XCTAssertEqual(login.value(forHTTPHeaderField: "X-Coco-Cliente"), "nativo")
        XCTAssertEqual(login.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertNil(login.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(login.url?.query())
        let c = try body(login)
        XCTAssertEqual(c["email"] as? String, "g@x.co")
        XCTAssertEqual(c["password"] as? String, "s3creto")
        XCTAssertEqual(c.count, 2)

        let refresh = armar(RequestBuilder.refresh(refreshToken: "r1"))
        XCTAssertEqual(refresh.url?.path(), "/api/v1/auth/refresh")
        XCTAssertEqual(refresh.value(forHTTPHeaderField: "X-Coco-Cliente"), "nativo")
        XCTAssertEqual(try body(refresh) as? [String: String], ["refresh_token": "r1"])
        XCTAssertNil(refresh.url?.query())

        let logout = armar(RequestBuilder.logout(refreshToken: "r1"))
        XCTAssertEqual(logout.url?.path(), "/api/v1/auth/logout")
        XCTAssertEqual(logout.value(forHTTPHeaderField: "X-Coco-Cliente"), "nativo")
        XCTAssertEqual(try body(logout) as? [String: String], ["refresh_token": "r1"])
    }

    func testLasDemasLlevanBearerYNoLaCabeceraNativa() throws {
        let r = CaptureRequest(
            source: .sms, externalRef: "E1", capturedAt: "2026-10-03T20:00:00Z",
            body: CaptureBody(text: "PAGO"))
        let capture = armar(RequestBuilder.capture(r), token: "tok")
        XCTAssertEqual(capture.url?.path(), "/api/v1/transactions/capture")
        XCTAssertEqual(capture.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        XCTAssertNil(capture.value(forHTTPHeaderField: "X-Coco-Cliente"))
        XCTAssertEqual(try body(capture)["source"] as? String, "sms")

        let interpret = armar(RequestBuilder.interpret(CaptureBody(merchant: "Koba")), token: "tok")
        XCTAssertEqual(interpret.url?.path(), "/api/v1/transactions/interpret")
        XCTAssertEqual(interpret.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        XCTAssertNil(interpret.value(forHTTPHeaderField: "X-Coco-Cliente"))

        let categories = armar(RequestBuilder.categories(), token: "tok")
        XCTAssertEqual(categories.httpMethod, "GET")
        XCTAssertEqual(categories.url?.path(), "/api/v1/categories")
        XCTAssertNil(categories.httpBody)
        XCTAssertEqual(categories.value(forHTTPHeaderField: "Authorization"), "Bearer tok")

        for r in [capture, interpret, categories] {
            XCTAssertNil(r.url?.query())
            XCTAssertFalse(r.url?.absoluteString.contains("tok") ?? true)
        }
    }

    func testUserAgent() {
        let r = armar(RequestBuilder.categories())
        XCTAssertEqual(r.value(forHTTPHeaderField: "User-Agent"), "CocoiOS/0.1.0 (iOS 17.0)")
        XCTAssertTrue(ua.hasPrefix(Brand.userAgentApp))
    }

    func testMultipart() throws {
        let name = "\(UUID().uuidString).jpg"
        let part = MultipartPart(
            fieldName: "archivos", fileName: name, mime: "image/jpeg", data: Data([0xFF, 0xD8, 0xFF]))
        let p = RequestBuilder.multipart(
            path: "/transactions/42/soportes", parts: [part], boundary: "FRONTERA")
        let r = armar(p, token: "tok")
        XCTAssertEqual(r.value(forHTTPHeaderField: "Content-Type"), "multipart/form-data; boundary=FRONTERA")
        XCTAssertEqual(p.timeout, .seconds(60))
        XCTAssertEqual(r.timeoutInterval, 60)
        // El cuerpo lleva el JPEG en binario: se quiere la lectura tolerante, que
        // cambia lo que no es UTF-8 por U+FFFD en vez de devolver nil.
        // swiftlint:disable:next optional_data_string_conversion
        let text = String(decoding: try XCTUnwrap(r.httpBody), as: UTF8.self)
        XCTAssertTrue(text.contains("name=\"archivos\"; filename=\"\(name)\""))
        XCTAssertTrue(text.contains("Content-Type: image/jpeg"))
        XCTAssertTrue(text.hasSuffix("--FRONTERA--\r\n"))
        XCTAssertNil(r.url?.query())
    }

    func testTiempoMaximoPorDefecto() {
        XCTAssertEqual(armar(RequestBuilder.categories()).timeoutInterval, 15)
    }
}
