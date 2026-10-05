import Foundation

/// El transporte real. Sesión efímera: sin caché ni cookies en disco, porque
/// la única credencial de larga vida vive en el Keychain y no aquí.
struct URLSessionTransport: Transport {
    let session: URLSession

    init(session: URLSession = URLSessionTransport.defaultSession()) {
        self.session = session
    }

    static func defaultSession() -> URLSession {
        let c = URLSessionConfiguration.ephemeral
        // La espera por red la gobierna la cola con sus reintentos, no URLSession.
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.unreadableResponse }
        return (data, http)
    }
}
