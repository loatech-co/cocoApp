import XCTest

@testable import Coco

final class APIClientTests: XCTestCase {
    private func client(_ transport: FakeTransport) -> APIClient {
        let base = URL(string: "https://api.coco.invalid") ?? URL(fileURLWithPath: "/")
        return APIClient(configuration: APIConfiguration(base: base), transport: transport, version: "0.1.0")
    }

    private func error(_ transport: FakeTransport) async -> APIError? {
        do {
            let _: [TreeNode] = try await client(transport).send(
                RequestBuilder.categories(), token: "tok")
            return nil
        } catch {
            return error as? APIError
        }
    }

    func test200WithDataDecodes() async throws {
        let t = FakeTransport([
            .http(
                200,
                #"{"data":[{"id":1,"name":"Hogar","parent_id":null,"palabras_clave":[],"is_archived":false,"estatico":false,"children":null}],"meta":{}}"#
            )
        ])
        let nodes: [TreeNode] = try await client(t).send(RequestBuilder.categories(), token: "tok")
        XCTAssertEqual(nodes.map(\.name), ["Hogar"])
        XCTAssertEqual(t.received.first?.url?.absoluteString, "https://api.coco.invalid/api/v1/categories")
    }

    func test401() async {
        let e = await error(
            FakeTransport([.http(401, #"{"error":{"code":"NO_AUTENTICADO","message":"La sesión expiró."}}"#)]))
        XCTAssertEqual(e, .unauthenticated)
        XCTAssertEqual(e?.isRetryable, false)
    }

    func test422WithCodeAndMessage() async {
        let e = await error(
            FakeTransport([.http(422, #"{"error":{"code":"VALIDACION","message":"Falta el monto","details":[]}}"#)]))
        XCTAssertEqual(e, .rejected(status: 422, code: "VALIDACION", message: "Falta el monto"))
        XCTAssertEqual(e?.isRetryable, false)
    }

    func testServerIsRetryable() async {
        for status in [500, 429, 408] {
            let e = await error(FakeTransport([.http(status, "")]))
            XCTAssertEqual(e, .server(status: status))
            XCTAssertEqual(e?.isRetryable, true)
            XCTAssertEqual(e?.isNetworkError, false)
        }
    }

    func testNoNetworkAndTimeout() async {
        let noNetwork = await error(FakeTransport([.failure(URLError(.notConnectedToInternet))]))
        XCTAssertEqual(noNetwork, .noNetwork(.notConnectedToInternet))
        XCTAssertEqual(noNetwork?.isNetworkError, true)
        XCTAssertEqual(noNetwork?.isRetryable, true)
        let timeout = await error(FakeTransport([.failure(URLError(.timedOut))]))
        XCTAssertEqual(timeout, .timedOut)
    }

    func testUnreadableBody() async {
        let html = await error(FakeTransport([.http(200, "<html>")]))
        XCTAssertEqual(html, .unreadableResponse)
        let otherShape = await error(FakeTransport([.http(200, #"{"data":{"no":"es un árbol"}}"#)]))
        XCTAssertEqual(otherShape, .unreadableResponse)
    }

    func test204DoesNotDecode() async throws {
        let t = FakeTransport([.http(204, "")])
        try await client(t).sendWithoutBody(RequestBuilder.logout(refreshToken: "r1"), token: nil)
        XCTAssertEqual(t.received.count, 1)
        XCTAssertNil(t.received.first?.value(forHTTPHeaderField: "Authorization"))
    }

    func testUploadUsesMultipartAndBearer() async throws {
        let t = FakeTransport([
            .http(
                201,
                #"{"data":[{"id":5,"orden":1,"nombre_archivo":"a.jpg","mime_type":"image/jpeg","tamano":3,"disponible":true}]}"#
            )
        ])
        let part = MultipartPart(
            fieldName: "archivos", fileName: "a.jpg", mime: "image/jpeg", data: Data([1, 2, 3]))
        let attachments: [Attachment] = try await client(t).upload(
            parts: [part], to: "/transactions/42/soportes", token: "tok")
        XCTAssertEqual(attachments.first?.id, 5)
        let r = try XCTUnwrap(t.received.first)
        XCTAssertTrue(r.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") ?? false)
        XCTAssertEqual(r.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
    }
}
