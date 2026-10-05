import Foundation

/// Todo lo que puede salir mal al hablar con la API, ya clasificado para que
/// la cola decida sin mirar códigos HTTP.
enum APIError: Error, Equatable {
    case sinRed(URLError.Code)
    case tiempoAgotado
    /// 401.
    case noAutenticado
    /// 4xx distinto de 401/408/429: la petición está mal y repetirla no ayuda.
    case rechazada(status: Int, code: String, mensaje: String)
    /// 5xx, 408 y 429: el servidor no pudo ahora; más tarde sí.
    case servidor(status: Int)
    case respuestaIlegible

    var esReintentable: Bool {
        switch self {
        case .sinRed, .tiempoAgotado, .servidor: true
        case .noAutenticado, .rechazada, .respuestaIlegible: false
        }
    }

    var esDeRed: Bool {
        switch self {
        case .sinRed, .tiempoAgotado: true
        default: false
        }
    }

    /// Un `URLError` del transporte, clasificado.
    static func desde(_ error: Error) -> APIError {
        if let api = error as? APIError { return api }
        if let url = error as? URLError {
            return url.code == .timedOut ? .tiempoAgotado : .sinRed(url.code)
        }
        return .sinRed(.unknown)
    }
}
