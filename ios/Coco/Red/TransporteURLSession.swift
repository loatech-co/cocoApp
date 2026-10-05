import Foundation

/// El transporte real. Sesión efímera: sin caché ni cookies en disco, porque
/// la única credencial de larga vida vive en el Keychain y no aquí.
struct TransporteURLSession: Transporte {
    let sesion: URLSession

    init(sesion: URLSession = TransporteURLSession.sesionPorDefecto()) {
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
        guard let http = respuesta as? HTTPURLResponse else { throw ErrorDeAPI.respuestaIlegible }
        return (datos, http)
    }
}
