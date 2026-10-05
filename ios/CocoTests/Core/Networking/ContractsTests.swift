import XCTest

@testable import Coco

/// Fixtures con la forma exacta de la API (claves snake_case).
final class ContractsTests: XCTestCase {
    private func decodificar<T: Decodable>(_ tipo: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(Envelope<T>.self, from: Data(json.utf8)).data
    }

    func testLoginNativo() throws {
        let json = """
            {"data":{"access_token":"eyJ.abc","expires_in":3600,"refresh_token":"r1",
              "user":{"id":1,"email":"g@x.co","display_name":null,"role":"owner","status":"active","created_at":"2026-01-01T00:00:00.000Z"}},
             "meta":{}}
            """
        let s = try decodificar(SessionResponse.self, json)
        XCTAssertEqual(s.accessToken, "eyJ.abc")
        XCTAssertEqual(s.expiresIn, 3600)
        XCTAssertEqual(s.refreshToken, "r1")
        XCTAssertEqual(s.user.id, 1)
        XCTAssertNil(s.user.displayName)
        XCTAssertEqual(s.user.createdAt, "2026-01-01T00:00:00.000Z")
    }

    func testLoginWebNoTraeRefreshYNoRompe() throws {
        let json = """
            {"data":{"access_token":"a","expires_in":900,
              "user":{"id":1,"email":"g@x.co","display_name":"G","role":"owner","status":"active","created_at":"2026-01-01T00:00:00.000Z"}}}
            """
        XCTAssertNil(try decodificar(SessionResponse.self, json).refreshToken)
    }

    func testCaptura() throws {
        let json = """
            {"data":{"transaction":{"id":42,"uuid":"u","account_id":1,"date":"2026-10-03","period":"2026-10-01","amount":"45000.00","type":"expense",
                "category_id":7,"description":null,"merchant":"Mercado","notes":null,"transfer_group_id":null,"transfer_direction":null,
                "external_ref":"E1","status":"posted","source":"ios_manual","raw_text":null,"captured_at":"2026-10-03T20:00:00.000Z","por_revisar":false,"tags":[],"splits":[],"created_at":"2026-10-03T20:00:00.000Z"},
              "clasificacion":{"certeza":"alta","fuente":null,"concepto_id":7,"categoria_id":3,"nombre":"Mercado","candidatos":[],"motivo":"Lo eligió la persona."},
              "resumen":"Registrado: $45.000 · Mercado","repetido":false,"fusionado":false}}
            """
        let c = try decodificar(CaptureResponse.self, json)
        XCTAssertEqual(c.transaction.id, 42)
        XCTAssertEqual(c.transaction.source, "ios_manual")
        XCTAssertEqual(c.classification.conceptId, 7)
        XCTAssertEqual(c.summary, "Registrado: $45.000 · Mercado")
    }

    func testInterpretacionConCandidatos() throws {
        let json = """
            {"data":{"amount":"12000","date":null,"merchant":"Koba","description":null,
              "clasificacion":{"certeza":"media","fuente":"palabras-clave","concepto_id":null,"categoria_id":3,"nombre":"Transporte",
                "candidatos":[{"id":9,"nombre":"Taxi","ruta":"Transporte › Taxi"}],"motivo":"Coincide una palabra clave."},
              "por_revisar":true}}
            """
        let i = try decodificar(Interpretation.self, json)
        XCTAssertEqual(i.amount, "12000")
        XCTAssertNil(i.date)
        XCTAssertEqual(i.classification.candidates.first?.path, "Transporte › Taxi")
        XCTAssertTrue(i.needsReview)
    }

    func testArbolConHijosYClaveOpcionalAusente() throws {
        let json = """
            {"data":[{"id":1,"name":"Hogar","parent_id":null,"kind":"expense","is_archived":false,"estatico":false,
              "children":[{"id":2,"name":"Aseo","parent_id":1,"palabras_clave":["jabón"],"is_archived":false,"estatico":false,"children":null}]}]}
            """
        let roots = try decodificar([TreeNode].self, json)
        XCTAssertEqual(roots.first?.keywords, [])
        XCTAssertEqual(roots.first?.children?.first?.keywords, ["jabón"])
    }

    func testErrorDeLaAPI() throws {
        let e = try JSONDecoder().decode(
            APIErrorBody.self,
            from: Data(#"{"error":{"code":"VALIDACION","message":"Falta el monto","details":[]}}"#.utf8))
        XCTAssertEqual(e.error.code, "VALIDACION")
    }

    func testCapturaRequestSeAplanaYCategoryIdVaComoCadena() throws {
        let r = CaptureRequest(
            source: .iosManual, externalRef: "E1", capturedAt: "2026-10-03T20:00:00Z",
            body: CaptureBody(amount: "45000", categoryId: 7, note: "ok"))
        let data = try JSONEncoder().encode(r)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["source"] as? String, "ios_manual")
        XCTAssertEqual(object["category_id"] as? String, "7")
        XCTAssertEqual(object["monto"] as? String, "45000")
        XCTAssertNil(object["cuerpo"])
        XCTAssertNil(object["texto"])
        XCTAssertEqual(Set(object.keys), ["source", "external_ref", "captured_at", "monto", "category_id", "nota"])
    }

    func testEsEnviable() {
        XCTAssertFalse(CaptureBody().isSendable)
        XCTAssertFalse(CaptureBody(amount: "1").isSendable)
        XCTAssertTrue(CaptureBody(text: "PAGO").isSendable)
        XCTAssertTrue(CaptureBody(merchant: "Koba").isSendable)
        XCTAssertTrue(CaptureBody(amount: "1", categoryId: 2).isSendable)
    }

    /// Lee packages/types/src/index.ts y falla si la marca se separa.
    func testMarcaCoincideConCocoTypes() throws {
        // ios/CocoTests/Core/Networking/<este archivo> → la raíz del repo.
        let root = (0..<5).reduce(URL(fileURLWithPath: #filePath)) { url, _ in url.deletingLastPathComponent() }
        let path = root.appending(path: "packages/types/src/index.ts")
        guard let source = try? String(contentsOf: path, encoding: .utf8) else {
            throw XCTSkip("No está el repo al lado: \(path.path)")
        }
        let regex = try NSRegularExpression(pattern: "export const USER_AGENT_APP = '([^']+)'")
        let coincidencia = try XCTUnwrap(regex.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)))
        let value = try XCTUnwrap(Range(coincidencia.range(at: 1), in: source)).map { String(source[$0]) }
        XCTAssertEqual(value, Brand.userAgentApp)
        XCTAssertTrue(
            source.contains(
                "export const CABECERA_CLIENTE_NATIVO = '\(RequestBuilder.nativeClientHeader.lowercased())'"
            ))
        XCTAssertTrue(source.contains("campo: '\(RequestBuilder.attachmentsField)'"))
    }
}
