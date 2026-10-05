import XCTest

@testable import Coco

final class RequestBuilderTests: XCTestCase {
    private let base = URL(string: "https://api.coco.invalid/api/v1") ?? URL(fileURLWithPath: "/")
    private let ua = Brand.userAgent(version: "0.1.0", sistema: "17.0")

    private func armar(_ p: APIRequest, token: String? = nil) -> URLRequest {
        RequestBuilder.urlRequest(p, base: base, token: token, userAgent: ua)
    }

    private func cuerpo(_ r: URLRequest) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(r.httpBody)) as? [String: Any])
    }

    func testLoginRefreshYLogoutSonNativosYSinQuery() throws {
        let login = armar(RequestBuilder.login(correo: "g@x.co", contrasena: "s3creto"))
        XCTAssertEqual(login.url?.absoluteString, "https://api.coco.invalid/api/v1/auth/login")
        XCTAssertEqual(login.httpMethod, "POST")
        XCTAssertEqual(login.value(forHTTPHeaderField: "X-Coco-Cliente"), "nativo")
        XCTAssertEqual(login.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertNil(login.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(login.url?.query())
        let c = try cuerpo(login)
        XCTAssertEqual(c["email"] as? String, "g@x.co")
        XCTAssertEqual(c["password"] as? String, "s3creto")
        XCTAssertEqual(c.count, 2)

        let refresh = armar(RequestBuilder.refresh(refreshToken: "r1"))
        XCTAssertEqual(refresh.url?.path(), "/api/v1/auth/refresh")
        XCTAssertEqual(refresh.value(forHTTPHeaderField: "X-Coco-Cliente"), "nativo")
        XCTAssertEqual(try cuerpo(refresh) as? [String: String], ["refresh_token": "r1"])
        XCTAssertNil(refresh.url?.query())

        let logout = armar(RequestBuilder.logout(refreshToken: "r1"))
        XCTAssertEqual(logout.url?.path(), "/api/v1/auth/logout")
        XCTAssertEqual(logout.value(forHTTPHeaderField: "X-Coco-Cliente"), "nativo")
        XCTAssertEqual(try cuerpo(logout) as? [String: String], ["refresh_token": "r1"])
    }

    func testLasDemasLlevanBearerYNoLaCabeceraNativa() throws {
        let r = CaptureRequest(
            source: .sms, external_ref: "E1", captured_at: "2026-10-03T20:00:00Z",
            cuerpo: CaptureBody(texto: "PAGO"))
        let capturar = armar(RequestBuilder.capturar(r), token: "tok")
        XCTAssertEqual(capturar.url?.path(), "/api/v1/transactions/capture")
        XCTAssertEqual(capturar.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        XCTAssertNil(capturar.value(forHTTPHeaderField: "X-Coco-Cliente"))
        XCTAssertEqual(try cuerpo(capturar)["source"] as? String, "sms")

        let interpretar = armar(RequestBuilder.interpretar(CaptureBody(comercio: "Koba")), token: "tok")
        XCTAssertEqual(interpretar.url?.path(), "/api/v1/transactions/interpret")
        XCTAssertEqual(interpretar.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        XCTAssertNil(interpretar.value(forHTTPHeaderField: "X-Coco-Cliente"))

        let categorias = armar(RequestBuilder.categorias(), token: "tok")
        XCTAssertEqual(categorias.httpMethod, "GET")
        XCTAssertEqual(categorias.url?.path(), "/api/v1/categories")
        XCTAssertNil(categorias.httpBody)
        XCTAssertEqual(categorias.value(forHTTPHeaderField: "Authorization"), "Bearer tok")

        for r in [capturar, interpretar, categorias] {
            XCTAssertNil(r.url?.query())
            XCTAssertFalse(r.url?.absoluteString.contains("tok") ?? true)
        }
    }

    func testUserAgent() {
        let r = armar(RequestBuilder.categorias())
        XCTAssertEqual(r.value(forHTTPHeaderField: "User-Agent"), "CocoiOS/0.1.0 (iOS 17.0)")
        XCTAssertTrue(ua.hasPrefix(Brand.userAgentApp))
    }

    func testMultipart() throws {
        let nombre = "\(UUID().uuidString).jpg"
        let parte = MultipartPart(
            nombreDelCampo: "archivos", nombreDeArchivo: nombre, mime: "image/jpeg", datos: Data([0xFF, 0xD8, 0xFF]))
        let p = RequestBuilder.multipart(
            ruta: "/transactions/42/soportes", partes: [parte], frontera: "FRONTERA")
        let r = armar(p, token: "tok")
        XCTAssertEqual(r.value(forHTTPHeaderField: "Content-Type"), "multipart/form-data; boundary=FRONTERA")
        XCTAssertEqual(p.tiempoMaximo, .seconds(60))
        XCTAssertEqual(r.timeoutInterval, 60)
        let texto = String(decoding: try XCTUnwrap(r.httpBody), as: UTF8.self)
        XCTAssertTrue(texto.contains("name=\"archivos\"; filename=\"\(nombre)\""))
        XCTAssertTrue(texto.contains("Content-Type: image/jpeg"))
        XCTAssertTrue(texto.hasSuffix("--FRONTERA--\r\n"))
        XCTAssertNil(r.url?.query())
    }

    func testTiempoMaximoPorDefecto() {
        XCTAssertEqual(armar(RequestBuilder.categorias()).timeoutInterval, 15)
    }
}
