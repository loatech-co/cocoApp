import Foundation

/// La única puerta de red. Construye la petición, la manda por el transporte
/// y traduce la respuesta a un tipo o a un `APIError`.
struct APIClient: Sendable {
    let configuration: APIConfiguration
    let transport: Transport
    let userAgent: String

    init(configuration: APIConfiguration, transport: Transport, version: String = Brand.version) {
        self.configuration = configuration
        self.transport = transport
        self.userAgent = Brand.userAgent(version: version)
    }

    /// Decodifica `Envelope<T>.data`.
    func send<T: Decodable>(_ p: APIRequest, token: String?) async throws -> T {
        let (data, _) = try await run(p, token: token)
        do {
            return try JSONDecoder().decode(Envelope<T>.self, from: data).data
        } catch {
            throw APIError.unreadableResponse
        }
    }

    /// Para un 204: no intenta leer nada.
    func sendWithoutBody(_ p: APIRequest, token: String?) async throws {
        _ = try await run(p, token: token)
    }

    /// El cuerpo tal cual llegó, sin decodificar. Lo usa la sesión, que
    /// necesita el `user` byte a byte para entregárselo a la web sin
    /// reescribir ni una clave.
    func sendRaw(_ p: APIRequest, token: String?) async throws -> Data {
        try await run(p, token: token).0
    }

    func upload<T: Decodable>(parts: [MultipartPart], to path: String, token: String) async throws -> T {
        let boundary = "coco-\(UUID().uuidString)"
        return try await send(
            RequestBuilder.multipart(path: path, parts: parts, boundary: boundary), token: token)
    }

    private func run(_ p: APIRequest, token: String?) async throws -> (Data, HTTPURLResponse) {
        let request = RequestBuilder.urlRequest(
            p, base: configuration.apiV1, token: token, userAgent: userAgent)
        let data: Data
        let response: HTTPURLResponse
        do {
            (data, response) = try await transport.data(for: request)
        } catch {
            throw APIError.from(error)
        }
        switch response.statusCode {
        case 200...299:
            return (data, response)
        case 401:
            throw APIError.unauthenticated
        case 408, 429, 500...599:
            throw APIError.server(status: response.statusCode)
        default:
            guard let error = try? JSONDecoder().decode(APIErrorBody.self, from: data) else {
                throw APIError.unreadableResponse
            }
            throw APIError.rejected(
                status: response.statusCode, code: error.error.code, message: error.error.message)
        }
    }
}
