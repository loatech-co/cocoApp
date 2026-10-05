import XCTest

@testable import Coco

/// Fixtures con la forma exacta de la `/api/v2` (`api/openapi.v2.json`).
final class ContractsTests: XCTestCase {
    private func decode<T: Decodable>(_ kind: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(Envelope<T>.self, from: Data(json.utf8)).data
    }

    func testNativeLogin() throws {
        let json = """
            {"data":{"accessToken":"eyJ.abc","expiresIn":3600,"refreshToken":"r1",
              "user":{"id":1,"email":"g@x.co","displayName":null,"role":"admin","status":"active","createdAt":"2026-01-01T00:00:00.000Z"}},
             "meta":{}}
            """
        let s = try decode(SessionResponse.self, json)
        XCTAssertEqual(s.accessToken, "eyJ.abc")
        XCTAssertEqual(s.expiresIn, 3600)
        XCTAssertEqual(s.refreshToken, "r1")
        XCTAssertEqual(s.user.id, 1)
        XCTAssertNil(s.user.displayName)
        XCTAssertEqual(s.user.createdAt, "2026-01-01T00:00:00.000Z")
    }

    func testWebLoginHasNoRefreshAndDoesNotBreak() throws {
        let json = """
            {"data":{"accessToken":"a","expiresIn":900,
              "user":{"id":1,"email":"g@x.co","displayName":"G","role":"user","status":"active","createdAt":"2026-01-01T00:00:00.000Z"}}}
            """
        XCTAssertNil(try decode(SessionResponse.self, json).refreshToken)
    }

    func testCapture() throws {
        let json = """
            {"data":{"transaction":{"id":42,"uuid":"u","accountId":1,"date":"2026-10-03","period":"2026-10-01","amount":"45000.00","currency":"COP","type":"expense",
                "categoryId":7,"description":null,"merchant":"Mercado","notes":null,"transferGroupId":null,"transferDirection":null,
                "externalRef":"E1","status":"cleared","source":"ios_manual","rawText":null,"capturedAt":"2026-10-03T20:00:00.000Z","needsReview":false,"tags":[],"splits":[],"createdAt":"2026-10-03T20:00:00.000Z"},
              "classification":{"certainty":"high","source":null,"conceptId":7,"categoryId":3,"name":"Mercado","candidates":[],"reason":"Lo eligió la persona."},
              "summary":"Registrado: $45.000 · Mercado","isDuplicate":false,"isMerged":false},"meta":{}}
            """
        let c = try decode(CaptureResponse.self, json)
        XCTAssertEqual(c.transaction.id, 42)
        XCTAssertEqual(c.transaction.source, "ios_manual")
        XCTAssertEqual(c.classification.conceptId, 7)
        XCTAssertEqual(c.summary, "Registrado: $45.000 · Mercado")
    }

    func testInterpretationWithCandidates() throws {
        let json = """
            {"data":{"amount":"12000","date":null,"merchant":"Koba","description":null,
              "classification":{"certainty":"medium","source":"keywords","conceptId":null,"categoryId":3,"name":"Transporte",
                "candidates":[{"id":9,"name":"Taxi","path":"Transporte › Taxi"}],"reason":"Coincide una palabra clave."},
              "needsReview":true}}
            """
        let i = try decode(Interpretation.self, json)
        XCTAssertEqual(i.amount, "12000")
        XCTAssertNil(i.date)
        XCTAssertEqual(i.classification.candidates.first?.path, "Transporte › Taxi")
        XCTAssertTrue(i.needsReview)
    }

    func testTreeWithChildrenAndMissingOptionalKey() throws {
        let json = """
            {"data":[{"id":1,"name":"Hogar","parentId":null,"kind":"expense","isArchived":false,"isStatic":false,
              "children":[{"id":2,"name":"Aseo","parentId":1,"keywords":["jabón"],"isArchived":false,"isStatic":false,"children":[]}]}],
             "meta":{"page":1,"perPage":50,"total":1}}
            """
        let roots = try decode([TreeNode].self, json)
        XCTAssertEqual(roots.first?.keywords, [])
        XCTAssertEqual(roots.first?.children?.first?.keywords, ["jabón"])
    }

    func testAPIError() throws {
        let e = try JSONDecoder().decode(
            APIErrorBody.self,
            from: Data(#"{"error":{"code":"VALIDACION","message":"Falta el monto","details":[]}}"#.utf8))
        XCTAssertEqual(e.error.code, "VALIDACION")
    }

    func testCaptureRequestIsFlattenedAndCategoryIdIsAString() throws {
        let r = CaptureRequest(
            source: .iosManual, externalRef: "E1", capturedAt: "2026-10-03T20:00:00Z",
            body: CaptureBody(amount: "45000", categoryId: 7, note: "ok"))
        let data = try JSONEncoder().encode(r)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["source"] as? String, "ios_manual")
        XCTAssertEqual(object["categoryId"] as? String, "7")
        XCTAssertEqual(object["amount"] as? String, "45000")
        XCTAssertNil(object["body"])
        XCTAssertNil(object["text"])
        XCTAssertEqual(Set(object.keys), ["source", "externalRef", "capturedAt", "amount", "categoryId", "note"])
    }

    func testIsSendable() {
        XCTAssertFalse(CaptureBody().isSendable)
        XCTAssertFalse(CaptureBody(amount: "1").isSendable)
        XCTAssertTrue(CaptureBody(text: "PAGO").isSendable)
        XCTAssertTrue(CaptureBody(merchant: "Koba").isSendable)
        XCTAssertTrue(CaptureBody(amount: "1", categoryId: 2).isSendable)
    }

    /// Lee packages/types/src/index.ts y api/openapi.v2.json y falla si la
    /// marca, la cabecera nativa o el campo de los soportes se separan.
    func testBrandMatchesCocoTypes() throws {
        // ios/CocoTests/Core/Networking/<este archivo> → la raíz del repo.
        let root = (0..<5).reduce(URL(fileURLWithPath: #filePath)) { url, _ in url.deletingLastPathComponent() }
        let path = root.appending(path: "packages/types/src/index.ts")
        guard let source = try? String(contentsOf: path, encoding: .utf8) else {
            throw XCTSkip("No está el repo al lado: \(path.path)")
        }
        let regex = try NSRegularExpression(pattern: "export const USER_AGENT_APP = '([^']+)'")
        let match = try XCTUnwrap(regex.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)))
        let value = try XCTUnwrap(Range(match.range(at: 1), in: source)).map { String(source[$0]) }
        XCTAssertEqual(value, Brand.userAgentApp)
        let spec = root.appending(path: "api/openapi.v2.json")
        guard let openAPI = try? String(contentsOf: spec, encoding: .utf8) else {
            throw XCTSkip("No está el contrato v2 al lado: \(spec.path)")
        }
        XCTAssertTrue(openAPI.contains(#""name": "\#(RequestBuilder.nativeClientHeader.lowercased())""#))
        XCTAssertTrue(openAPI.contains(#""enum": ["\#(RequestBuilder.nativeClient)"]"#))
        XCTAssertTrue(openAPI.contains(#""required": ["\#(RequestBuilder.attachmentsField)"]"#))
    }
}
