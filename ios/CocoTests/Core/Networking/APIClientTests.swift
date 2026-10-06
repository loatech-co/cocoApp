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
                RequestBuilder.categories(page: 1), token: "tok")
            return nil
        } catch {
            return error as? APIError
        }
    }

    func test200WithDataDecodes() async throws {
        let t = FakeTransport([
            .http(
                200,
                #"{"data":[{"id":1,"name":"Hogar","parentId":null,"keywords":[],"isArchived":false,"isStatic":false,"children":null}],"meta":{"page":1,"perPage":200,"total":1}}"#
            )
        ])
        let nodes: [TreeNode] = try await client(t).sendAllPages(RequestBuilder.categories(page:), token: "tok")
        XCTAssertEqual(nodes.map(\.name), ["Hogar"])
        XCTAssertEqual(
            t.received.first?.url?.absoluteString, "https://api.coco.invalid/api/v2/categories?page=1&perPage=200")
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
        XCTAssertEqual(e, .rejected(APIProblem(status: 422, code: .other("VALIDACION"), detail: "Falta el monto")))
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

    /// Un 2xx ilegible NO es lo mismo que un error ilegible: el servidor ya
    /// hizo lo que se pidió, y la cola no debe repetirlo.
    func testUnreadableBody() async {
        let html = await error(FakeTransport([.http(200, "<html>")]))
        XCTAssertEqual(html, .unreadableSuccess(status: 200))
        let otherShape = await error(FakeTransport([.http(201, #"{"data":{"no":"es un árbol"}}"#)]))
        XCTAssertEqual(otherShape, .unreadableSuccess(status: 201))
        XCTAssertEqual(otherShape?.isRetryable, false)
        let unreadableError = await error(FakeTransport([.http(422, "<html>")]))
        XCTAssertEqual(unreadableError, .unreadableResponse)
    }

    func testCancellationIsNotANetworkFailure() async {
        XCTAssertEqual(APIError.from(CancellationError()), .cancelled)
        XCTAssertEqual(APIError.from(URLError(.cancelled)), .cancelled)
        XCTAssertEqual(APIError.cancelled.isRetryable, false)
        XCTAssertEqual(APIError.cancelled.isNetworkError, false)
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
                #"{"data":[{"id":5,"position":1,"fileName":"a.jpg","mimeType":"image/jpeg","sizeBytes":3,"isAvailable":true}]}"#
            )
        ])
        let part = MultipartPart(
            fieldName: "files", fileName: "a.jpg", mime: "image/jpeg", data: Data([1, 2, 3]))
        let attachments: [Attachment] = try await client(t).upload(
            parts: [part], to: "/transactions/42/receipts", token: "tok")
        XCTAssertEqual(attachments.first?.id, 5)
        let r = try XCTUnwrap(t.received.first)
        XCTAssertTrue(r.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") ?? false)
        XCTAssertEqual(r.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
    }

    // MARK: v2 de punta a punta, con la red de mentira

    private static func node(_ id: Int) -> String {
        #"{"id":\#(id),"name":"C\#(id)","parentId":null,"keywords":[],"isArchived":false,"isStatic":false,"children":[]}"#
    }

    /// El árbol de la v2 se pagina por centros de costos: se piden páginas
    /// hasta juntar `meta.total`.
    func testTheTreeIsDownloadedPageByPage() async throws {
        let t = FakeTransport([
            .http(200, #"{"data":[\#(Self.node(1)),\#(Self.node(2))],"meta":{"page":1,"perPage":2,"total":3}}"#),
            .http(200, #"{"data":[\#(Self.node(3))],"meta":{"page":2,"perPage":2,"total":3}}"#),
        ])
        let nodes: [TreeNode] = try await client(t).sendAllPages(RequestBuilder.categories(page:), token: "tok")
        XCTAssertEqual(nodes.map(\.id), [1, 2, 3])
        XCTAssertEqual(t.received.map { $0.url?.query() }, ["page=1&perPage=200", "page=2&perPage=200"])
    }

    func testAnEmptyPageEndsTheDownload() async throws {
        let t = FakeTransport([.http(200, #"{"data":[],"meta":{"page":1,"perPage":200,"total":5}}"#)])
        let nodes: [TreeNode] = try await client(t).sendAllPages(RequestBuilder.categories(page:), token: "tok")
        XCTAssertEqual(nodes, [])
        XCTAssertEqual(t.received.count, 1)
    }

    private static func captureJSON(duplicate: Bool) -> String {
        #"{"data":{"transaction":{"id":42,"date":"2026-10-03","amount":"45000.00","categoryId":7,"description":null,"merchant":"D1","source":"ios_manual","needsReview":false},"classification":{"certainty":"high","source":null,"conceptId":7,"categoryId":3,"name":"Mercado","candidates":[],"reason":"m"},"summary":"Registrado","isDuplicate":\#(duplicate),"isMerged":false},"meta":{}}"#
    }

    /// Reenviar la misma captura manda el mismo `externalRef`: la API contesta
    /// la transacción ya registrada con `isDuplicate`, no una segunda.
    func testARetriedCaptureKeepsItsExternalRefAndReadsTheDuplicate() async throws {
        let t = FakeTransport([
            .http(200, Self.captureJSON(duplicate: false)), .http(200, Self.captureJSON(duplicate: true)),
        ])
        let sender = APICaptureSender(api: client(t), session: SessionDouble())
        let pending = PendingCapture(source: .iosManual, body: CaptureBody(amount: "45000", categoryId: 7))
        let first = try await sender.capture(pending.request)
        let second = try await sender.capture(pending.request)
        XCTAssertFalse(first.duplicate)
        XCTAssertTrue(second.duplicate)
        XCTAssertEqual(second.transaction.id, first.transaction.id)
        let bodies = try t.received.map { r in
            try XCTUnwrap(JSONSerialization.jsonObject(with: r.httpBody ?? Data()) as? [String: Any])
        }
        XCTAssertEqual(bodies.map { $0["externalRef"] as? String }, [pending.id.uuidString, pending.id.uuidString])
        XCTAssertEqual(bodies.first?["categoryId"] as? String, "7")
        XCTAssertEqual(
            t.received.map { $0.url?.path() }, ["/api/v2/transactions/capture", "/api/v2/transactions/capture"])
        XCTAssertEqual(t.received.first?.value(forHTTPHeaderField: "Authorization"), "Bearer token-1")
    }

    func testThePhotoGoesToReceiptsAsFiles() async throws {
        let t = FakeTransport([
            .http(
                201,
                #"{"data":[{"id":5,"position":1,"fileName":"a.jpg","mimeType":"image/jpeg","sizeBytes":3,"isAvailable":true}],"meta":{"page":1,"perPage":50,"total":1}}"#
            )
        ])
        let sender = APICaptureSender(api: client(t), session: SessionDouble())
        let attachments = try await sender.uploadPhoto(Data([1, 2, 3]), name: "a.jpg", to: 42)
        XCTAssertEqual(attachments.first?.available, true)
        let r = try XCTUnwrap(t.received.first)
        XCTAssertEqual(r.url?.path(), "/api/v2/transactions/42/receipts")
        let body = String(data: r.httpBody ?? Data(), encoding: .utf8) ?? ""
        XCTAssertTrue(body.contains(#"name="files"; filename="a.jpg""#))
    }
}
