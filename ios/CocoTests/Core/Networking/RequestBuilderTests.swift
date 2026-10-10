import XCTest

@testable import Coco

final class RequestBuilderTests: XCTestCase {
    private let base = URL(string: "https://api.coco.invalid/api/v2") ?? URL(fileURLWithPath: "/")
    private let ua = Brand.userAgent(version: "0.1.0", system: "17.0")

    private func build(_ p: APIRequest, token: String? = nil) -> URLRequest {
        RequestBuilder.urlRequest(p, base: base, token: token, userAgent: ua)
    }

    private func body(_ r: URLRequest) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(r.httpBody)) as? [String: Any])
    }

    func testLoginRefreshAndLogoutAreNativeAndWithoutQuery() throws {
        let login = build(RequestBuilder.login(email: "g@x.co", password: "s3creto"))
        XCTAssertEqual(login.url?.absoluteString, "https://api.coco.invalid/api/v2/auth/login")
        XCTAssertEqual(login.httpMethod, "POST")
        XCTAssertEqual(login.value(forHTTPHeaderField: "X-Coco-Client"), "native")
        XCTAssertEqual(login.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertNil(login.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(login.url?.query())
        let c = try body(login)
        XCTAssertEqual(c["email"] as? String, "g@x.co")
        XCTAssertEqual(c["password"] as? String, "s3creto")
        XCTAssertEqual(c.count, 2)

        let refresh = build(RequestBuilder.refresh(refreshToken: "r1"))
        XCTAssertEqual(refresh.url?.path(), "/api/v2/auth/refresh")
        XCTAssertEqual(refresh.value(forHTTPHeaderField: "X-Coco-Client"), "native")
        XCTAssertEqual(try body(refresh) as? [String: String], ["refreshToken": "r1"])
        XCTAssertNil(refresh.url?.query())

        let logout = build(RequestBuilder.logout(refreshToken: "r1"))
        XCTAssertEqual(logout.url?.path(), "/api/v2/auth/logout")
        XCTAssertEqual(logout.value(forHTTPHeaderField: "X-Coco-Client"), "native")
        XCTAssertEqual(try body(logout) as? [String: String], ["refreshToken": "r1"])
    }

    func testTheOthersCarryBearerAndNotTheNativeHeader() throws {
        let r = CaptureRequest(
            source: .sms, externalRef: "E1", capturedAt: "2026-10-03T20:00:00Z",
            body: CaptureBody(text: "PAGO"))
        let capture = build(RequestBuilder.capture(r), token: "tok")
        XCTAssertEqual(capture.url?.path(), "/api/v2/transactions/capture")
        XCTAssertEqual(capture.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        XCTAssertNil(capture.value(forHTTPHeaderField: "X-Coco-Client"))
        XCTAssertEqual(try body(capture)["source"] as? String, "sms")

        let interpret = build(RequestBuilder.interpret(CaptureBody(merchant: "Koba")), token: "tok")
        XCTAssertEqual(interpret.url?.path(), "/api/v2/transactions/interpret")
        XCTAssertEqual(interpret.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        XCTAssertNil(interpret.value(forHTTPHeaderField: "X-Coco-Client"))

        let categories = build(RequestBuilder.categories(page: 1), token: "tok")
        XCTAssertEqual(categories.httpMethod, "GET")
        XCTAssertEqual(categories.url?.path(), "/api/v2/categories")
        XCTAssertNil(categories.httpBody)
        XCTAssertEqual(categories.value(forHTTPHeaderField: "Authorization"), "Bearer tok")

        XCTAssertEqual(categories.url?.query(), "page=1&perPage=200")
        for r in [capture, interpret] { XCTAssertNil(r.url?.query()) }
        for r in [capture, interpret, categories] {
            XCTAssertFalse(r.url?.absoluteString.contains("tok") ?? true)
        }
    }

    func testUserAgent() {
        let r = build(RequestBuilder.categories(page: 1))
        XCTAssertEqual(r.value(forHTTPHeaderField: "User-Agent"), "CocoiOS/0.1.0 (iOS 17.0)")
        XCTAssertTrue(ua.hasPrefix(Brand.userAgentApp))
    }

    func testMultipart() throws {
        let name = "\(UUID().uuidString).jpg"
        let part = MultipartPart(
            fieldName: "files", fileName: name, mime: "image/jpeg", data: Data([0xFF, 0xD8, 0xFF]))
        let p = RequestBuilder.multipart(
            path: "/transactions/42/receipts", parts: [part], boundary: "FRONTERA")
        let r = build(p, token: "tok")
        XCTAssertEqual(r.value(forHTTPHeaderField: "Content-Type"), "multipart/form-data; boundary=FRONTERA")
        XCTAssertEqual(p.timeout, .seconds(60))
        XCTAssertEqual(r.timeoutInterval, 60)
        // The body carries the JPEG in binary: the tolerant read is wanted, which
        // replaces what is not UTF-8 with U+FFFD instead of returning nil.
        // swiftlint:disable:next optional_data_string_conversion
        let text = String(decoding: try XCTUnwrap(r.httpBody), as: UTF8.self)
        XCTAssertTrue(text.contains("name=\"files\"; filename=\"\(name)\""))
        XCTAssertTrue(text.contains("Content-Type: image/jpeg"))
        XCTAssertTrue(text.hasSuffix("--FRONTERA--\r\n"))
        XCTAssertNil(r.url?.query())
    }

    func testDefaultTimeout() {
        XCTAssertEqual(build(RequestBuilder.categories(page: 1)).timeoutInterval, 15)
    }
}
