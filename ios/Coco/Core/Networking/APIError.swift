import Foundation

/// Todo lo que puede salir mal al hablar con la API, ya clasificado para que
/// la cola decida sin mirar códigos HTTP.
enum APIError: Error, Equatable {
    case noNetwork(URLError.Code)
    case timedOut
    /// 401.
    case unauthenticated
    /// 4xx distinto de 401/408/429: la petición está mal y repetirla no ayuda.
    case rejected(status: Int, code: String, message: String)
    /// 5xx, 408 y 429: el servidor no pudo ahora; más tarde sí.
    case server(status: Int)
    case unreadableResponse

    var isRetryable: Bool {
        switch self {
        case .noNetwork, .timedOut, .server: true
        case .unauthenticated, .rejected, .unreadableResponse: false
        }
    }

    var isNetworkError: Bool {
        switch self {
        case .noNetwork, .timedOut: true
        default: false
        }
    }

    /// Un `URLError` del transporte, clasificado.
    static func from(_ error: Error) -> APIError {
        if let api = error as? APIError { return api }
        if let url = error as? URLError {
            return url.code == .timedOut ? .timedOut : .noNetwork(url.code)
        }
        return .noNetwork(.unknown)
    }
}
