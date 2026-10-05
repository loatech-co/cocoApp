import Foundation

/// El enviador real: pide el token vigente a la sesión y habla con la API.
/// Lo que la sesión no puede dar se traduce a `APIError` para que la cola
/// decida con una sola familia de errores.
struct APICaptureSender: CaptureSender {
    let api: APIClient
    let sesion: Session

    func capturar(_ r: CaptureRequest) async throws -> CaptureResponse {
        let token = try await tokenVigente()
        return try await api.enviar(RequestBuilder.capturar(r), token: token)
    }

    func subirFoto(_ jpeg: Data, nombre: String, a transactionId: Int) async throws -> [Attachment] {
        let token = try await tokenVigente()
        let parte = MultipartPart(
            nombreDelCampo: RequestBuilder.campoDeSoportes, nombreDeArchivo: nombre, mime: "image/jpeg",
            datos: jpeg)
        return try await api.subir(partes: [parte], a: "/transactions/\(transactionId)/soportes", token: token)
    }

    private func tokenVigente() async throws -> String {
        do {
            return try await sesion.accessTokenVigente()
        } catch SessionError.sinSesion {
            throw APIError.noAutenticado
        } catch SessionError.sinConexion {
            throw APIError.sinRed(.notConnectedToInternet)
        }
    }
}
