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
    /// Una respuesta de error (no 2xx) que no tiene la forma de la API.
    case unreadableResponse
    /// Un 2xx cuyo cuerpo no se deja leer: el servidor HIZO lo que se pidió y
    /// lo que no se sabe es el resultado. Repetirlo podría hacerlo dos veces.
    case unreadableSuccess(status: Int)
    /// Se canceló quien esperaba —venció el presupuesto o iOS recogió la
    /// tarea—. No es un fallo de la petición y no cuenta como intento.
    case cancelled

    var isRetryable: Bool {
        switch self {
        case .noNetwork, .timedOut, .server: true
        case .unauthenticated, .rejected, .unreadableResponse, .unreadableSuccess, .cancelled: false
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
        if error is CancellationError { return .cancelled }
        if let url = error as? URLError {
            switch url.code {
            case .timedOut: return .timedOut
            case .cancelled: return .cancelled
            default: return .noNetwork(url.code)
            }
        }
        return .noNetwork(.unknown)
    }
}
