import Foundation

/// The real sender: it asks the session for the current token and talks to the API.
/// What the session cannot give is translated into an `APIError` so that the queue
/// decides with a single family of errors.
struct APICaptureSender: CaptureSender {
    let api: APIClient
    let session: Session

    func capture(_ r: CaptureRequest) async throws -> CaptureResponse {
        let token = try await validToken()
        return try await api.send(RequestBuilder.capture(r), token: token)
    }

    func uploadPhoto(_ jpeg: Data, name: String, to transactionId: Int) async throws -> [Attachment] {
        let token = try await validToken()
        let part = MultipartPart(
            fieldName: RequestBuilder.attachmentsField, fileName: name, mime: "image/jpeg",
            data: jpeg)
        return try await api.upload(
            parts: [part], to: RequestBuilder.receiptsPath(transactionId: transactionId), token: token)
    }

    private func validToken() async throws -> String {
        do {
            return try await session.validAccessToken()
        } catch SessionError.signedOut {
            throw APIError.unauthenticated
        } catch SessionError.offline {
            throw APIError.noNetwork(.notConnectedToInternet)
        }
    }
}
