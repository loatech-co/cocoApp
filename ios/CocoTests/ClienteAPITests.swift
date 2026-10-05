import XCTest
@testable import Coco

final class ClienteAPITests: XCTestCase {
    private func cliente(_ transporte: TransporteFalso) -> ClienteAPI {
        let base = URL(string: "https://api.coco.invalid") ?? URL(fileURLWithPath: "/")
        return ClienteAPI(configuracion: ConfiguracionDeLaAPI(base: base), transporte: transporte, version: "0.1.0")
    }

    private func error(_ transporte: TransporteFalso) async -> ErrorDeAPI? {
        do {
            let _: [NodoDelArbol] = try await cliente(transporte).enviar(ConstructorDePeticiones.categorias(), token: "tok")
            return nil
        } catch {
            return error as? ErrorDeAPI
        }
    }

    func test200ConDataDecodifica() async throws {
        let t = TransporteFalso([.http(200, #"{"data":[{"id":1,"name":"Hogar","parent_id":null,"palabras_clave":[],"is_archived":false,"estatico":false,"children":null}],"meta":{}}"#)])
        let nodos: [NodoDelArbol] = try await cliente(t).enviar(ConstructorDePeticiones.categorias(), token: "tok")
        XCTAssertEqual(nodos.map(\.name), ["Hogar"])
        XCTAssertEqual(t.recibidas.first?.url?.absoluteString, "https://api.coco.invalid/api/v1/categories")
    }

    func test401() async {
        let e = await error(TransporteFalso([.http(401, #"{"error":{"code":"NO_AUTENTICADO","message":"La sesión expiró."}}"#)]))
        XCTAssertEqual(e, .noAutenticado)
        XCTAssertEqual(e?.esReintentable, false)
    }

    func test422ConCodigoYMensaje() async {
        let e = await error(TransporteFalso([.http(422, #"{"error":{"code":"VALIDACION","message":"Falta el monto","details":[]}}"#)]))
        XCTAssertEqual(e, .rechazada(status: 422, code: "VALIDACION", mensaje: "Falta el monto"))
        XCTAssertEqual(e?.esReintentable, false)
    }

    func testServidorReintentable() async {
        for status in [500, 429, 408] {
            let e = await error(TransporteFalso([.http(status, "")]))
            XCTAssertEqual(e, .servidor(status: status))
            XCTAssertEqual(e?.esReintentable, true)
            XCTAssertEqual(e?.esDeRed, false)
        }
    }

    func testSinRedYTiempoAgotado() async {
        let sinRed = await error(TransporteFalso([.falla(URLError(.notConnectedToInternet))]))
        XCTAssertEqual(sinRed, .sinRed(.notConnectedToInternet))
        XCTAssertEqual(sinRed?.esDeRed, true)
        XCTAssertEqual(sinRed?.esReintentable, true)
        let tiempo = await error(TransporteFalso([.falla(URLError(.timedOut))]))
        XCTAssertEqual(tiempo, .tiempoAgotado)
    }

    func testCuerpoIlegible() async {
        let html = await error(TransporteFalso([.http(200, "<html>")]))
        XCTAssertEqual(html, .respuestaIlegible)
        let otraForma = await error(TransporteFalso([.http(200, #"{"data":{"no":"es un árbol"}}"#)]))
        XCTAssertEqual(otraForma, .respuestaIlegible)
    }

    func test204NoDecodifica() async throws {
        let t = TransporteFalso([.http(204, "")])
        try await cliente(t).enviarSinCuerpo(ConstructorDePeticiones.logout(refreshToken: "r1"), token: nil)
        XCTAssertEqual(t.recibidas.count, 1)
        XCTAssertNil(t.recibidas.first?.value(forHTTPHeaderField: "Authorization"))
    }

    func testSubirUsaMultipartYBearer() async throws {
        let t = TransporteFalso([.http(201, #"{"data":[{"id":5,"orden":1,"nombre_archivo":"a.jpg","mime_type":"image/jpeg","tamano":3,"disponible":true}]}"#)])
        let parte = ParteMultipart(nombreDelCampo: "archivos", nombreDeArchivo: "a.jpg", mime: "image/jpeg", datos: Data([1, 2, 3]))
        let soportes: [Soporte] = try await cliente(t).subir(partes: [parte], a: "/transactions/42/soportes", token: "tok")
        XCTAssertEqual(soportes.first?.id, 5)
        let r = try XCTUnwrap(t.recibidas.first)
        XCTAssertTrue(r.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") ?? false)
        XCTAssertEqual(r.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
    }
}
