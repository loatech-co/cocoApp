import Foundation

/// El enviador real: pide el token vigente a la sesión y habla con la API.
/// Lo que la sesión no puede dar se traduce a `ErrorDeAPI` para que la cola
/// decida con una sola familia de errores.
struct EnviadorPorAPI: EnviadorDeCapturas {
    let api: ClienteAPI
    let sesion: Sesion

    init(api: ClienteAPI, sesion: Sesion) {
        self.api = api
        self.sesion = sesion
    }

    func capturar(_ r: CapturaRequest) async throws -> Captura {
        let token = try await tokenVigente()
        return try await api.enviar(ConstructorDePeticiones.capturar(r), token: token)
    }

    func subirFoto(_ jpeg: Data, nombre: String, a transactionId: Int) async throws -> [Soporte] {
        let token = try await tokenVigente()
        let parte = ParteMultipart(
            nombreDelCampo: ConstructorDePeticiones.campoDeSoportes, nombreDeArchivo: nombre, mime: "image/jpeg",
            datos: jpeg)
        return try await api.subir(partes: [parte], a: "/transactions/\(transactionId)/soportes", token: token)
    }

    private func tokenVigente() async throws -> String {
        do {
            return try await sesion.accessTokenVigente()
        } catch ErrorDeSesion.sinSesion {
            throw ErrorDeAPI.noAutenticado
        } catch ErrorDeSesion.sinConexion {
            throw ErrorDeAPI.sinRed(.notConnectedToInternet)
        }
    }
}
