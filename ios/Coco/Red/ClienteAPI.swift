import Foundation

/// La única puerta de red. Construye la petición, la manda por el transporte
/// y traduce la respuesta a un tipo o a un `ErrorDeAPI`.
struct ClienteAPI: Sendable {
    let configuracion: ConfiguracionDeLaAPI
    let transporte: Transporte
    let userAgent: String

    init(configuracion: ConfiguracionDeLaAPI, transporte: Transporte, version: String = Marca.version) {
        self.configuracion = configuracion
        self.transporte = transporte
        self.userAgent = Marca.userAgent(version: version)
    }

    /// Decodifica `Sobre<T>.data`.
    func enviar<T: Decodable>(_ p: Peticion, token: String?) async throws -> T {
        let (datos, _) = try await ejecutar(p, token: token)
        do {
            return try JSONDecoder().decode(Sobre<T>.self, from: datos).data
        } catch {
            throw ErrorDeAPI.respuestaIlegible
        }
    }

    /// Para un 204: no intenta leer nada.
    func enviarSinCuerpo(_ p: Peticion, token: String?) async throws {
        _ = try await ejecutar(p, token: token)
    }

    /// El cuerpo tal cual llegó, sin decodificar. Lo usa la sesión, que
    /// necesita el `user` byte a byte para entregárselo a la web sin
    /// reescribir ni una clave.
    func enviarCrudo(_ p: Peticion, token: String?) async throws -> Data {
        try await ejecutar(p, token: token).0
    }

    func subir<T: Decodable>(partes: [ParteMultipart], a ruta: String, token: String) async throws -> T {
        let frontera = "coco-\(UUID().uuidString)"
        return try await enviar(ConstructorDePeticiones.multipart(ruta: ruta, partes: partes, frontera: frontera), token: token)
    }

    private func ejecutar(_ p: Peticion, token: String?) async throws -> (Data, HTTPURLResponse) {
        let request = ConstructorDePeticiones.urlRequest(p, base: configuracion.apiV1, token: token, userAgent: userAgent)
        let datos: Data
        let respuesta: HTTPURLResponse
        do {
            (datos, respuesta) = try await transporte.datos(para: request)
        } catch {
            throw ErrorDeAPI.desde(error)
        }
        switch respuesta.statusCode {
        case 200...299:
            return (datos, respuesta)
        case 401:
            throw ErrorDeAPI.noAutenticado
        case 408, 429, 500...599:
            throw ErrorDeAPI.servidor(status: respuesta.statusCode)
        default:
            guard let error = try? JSONDecoder().decode(ErrorDeLaAPI.self, from: datos) else {
                throw ErrorDeAPI.respuestaIlegible
            }
            throw ErrorDeAPI.rechazada(status: respuesta.statusCode, code: error.error.code, mensaje: error.error.message)
        }
    }
}
