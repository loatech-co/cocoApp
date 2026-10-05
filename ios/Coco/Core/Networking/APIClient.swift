import Foundation

/// La única puerta de red. Construye la petición, la manda por el transporte
/// y traduce la respuesta a un tipo o a un `APIError`.
struct APIClient: Sendable {
    let configuracion: APIConfiguration
    let transporte: Transport
    let userAgent: String

    init(configuracion: APIConfiguration, transporte: Transport, version: String = Brand.version) {
        self.configuracion = configuracion
        self.transporte = transporte
        self.userAgent = Brand.userAgent(version: version)
    }

    /// Decodifica `Envelope<T>.data`.
    func enviar<T: Decodable>(_ p: APIRequest, token: String?) async throws -> T {
        let (datos, _) = try await ejecutar(p, token: token)
        do {
            return try JSONDecoder().decode(Envelope<T>.self, from: datos).data
        } catch {
            throw APIError.respuestaIlegible
        }
    }

    /// Para un 204: no intenta leer nada.
    func enviarSinCuerpo(_ p: APIRequest, token: String?) async throws {
        _ = try await ejecutar(p, token: token)
    }

    /// El cuerpo tal cual llegó, sin decodificar. Lo usa la sesión, que
    /// necesita el `user` byte a byte para entregárselo a la web sin
    /// reescribir ni una clave.
    func enviarCrudo(_ p: APIRequest, token: String?) async throws -> Data {
        try await ejecutar(p, token: token).0
    }

    func subir<T: Decodable>(partes: [MultipartPart], a ruta: String, token: String) async throws -> T {
        let frontera = "coco-\(UUID().uuidString)"
        return try await enviar(
            RequestBuilder.multipart(ruta: ruta, partes: partes, frontera: frontera), token: token)
    }

    private func ejecutar(_ p: APIRequest, token: String?) async throws -> (Data, HTTPURLResponse) {
        let request = RequestBuilder.urlRequest(
            p, base: configuracion.apiV1, token: token, userAgent: userAgent)
        let datos: Data
        let respuesta: HTTPURLResponse
        do {
            (datos, respuesta) = try await transporte.datos(para: request)
        } catch {
            throw APIError.desde(error)
        }
        switch respuesta.statusCode {
        case 200...299:
            return (datos, respuesta)
        case 401:
            throw APIError.noAutenticado
        case 408, 429, 500...599:
            throw APIError.servidor(status: respuesta.statusCode)
        default:
            guard let error = try? JSONDecoder().decode(APIErrorBody.self, from: datos) else {
                throw APIError.respuestaIlegible
            }
            throw APIError.rechazada(
                status: respuesta.statusCode, code: error.error.code, mensaje: error.error.message)
        }
    }
}
