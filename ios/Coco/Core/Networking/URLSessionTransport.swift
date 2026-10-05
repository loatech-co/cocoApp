import Foundation

/// El transporte real. Sesión efímera: sin caché ni cookies en disco, porque
/// la única credencial de larga vida vive en el Keychain y no aquí.
struct URLSessionTransport: Transport {
    let sesion: URLSession

    init(sesion: URLSession = URLSessionTransport.sesionPorDefecto()) {
        self.sesion = sesion
    }

    static func sesionPorDefecto() -> URLSession {
        let c = URLSessionConfiguration.ephemeral
        // La espera por red la gobierna la cola con sus reintentos, no URLSession.
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }

    func datos(para peticion: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (datos, respuesta) = try await sesion.data(for: peticion)
        guard let http = respuesta as? HTTPURLResponse else { throw APIError.respuestaIlegible }
        return (datos, http)
    }
}
