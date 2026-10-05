import Foundation

/// El enviador real: pide el token vigente a la sesión y habla con la API.
/// Lo que la sesión no puede dar se traduce a `APIError` para que la cola
/// decida con una sola familia de errores.
struct APICaptureSender: CaptureSender {
    let api: APIClient
    let session: Session

    func capture(_ r: CaptureRequest) async throws -> CaptureResponse {
        let token = try await tokenVigente()
        return try await api.send(RequestBuilder.capture(r), token: token)
    }

    func uploadPhoto(_ jpeg: Data, name: String, to transactionId: Int) async throws -> [Attachment] {
        let token = try await tokenVigente()
        let part = MultipartPart(
            fieldName: RequestBuilder.attachmentsField, fileName: name, mime: "image/jpeg",
            data: jpeg)
        return try await api.upload(parts: [part], to: "/transactions/\(transactionId)/soportes", token: token)
    }

    private func tokenVigente() async throws -> String {
        do {
            return try await session.validAccessToken()
        } catch SessionError.signedOut {
            throw APIError.unauthenticated
        } catch SessionError.offline {
            throw APIError.noNetwork(.notConnectedToInternet)
        }
    }
}
