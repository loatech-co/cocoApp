import Foundation

/// Todo lo que puede salir mal al hablar con la API, ya clasificado para que
/// la cola decida sin mirar códigos HTTP. Se decide por el `code` del
/// problema y, si no lo hay o no se conoce, por el status.
enum APIError: Error, Equatable {
    case noNetwork(URLError.Code)
    case timedOut
    /// 401 que se arregla renovando: `session_expired`, `invalid_token`,
    /// `unauthenticated`, o un 401 sin código conocido.
    case unauthenticated
    /// 401 `session_revoked`: renovar no sirve, la sesión se cierra.
    case sessionRevoked
    /// 409 `duplicate`: lo que se mandaba ya existe; cuenta como hecho.
    case duplicate(APIProblem)
    /// El resto de 4xx (validación, ajeno, credenciales, cuenta): la petición
    /// está mal y repetirla no ayuda.
    case rejected(APIProblem)
    /// 5xx, 408 y 429: el servidor no pudo ahora; más tarde sí.
    case server(status: Int)
    /// Una respuesta de error (no 2xx) que no tiene la forma de la API: un
    /// HTML de un proxy, un cuerpo vacío.
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
        case .unauthenticated, .sessionRevoked, .duplicate, .rejected, .unreadableResponse, .unreadableSuccess,
            .cancelled:
            false
        }
    }

    var isNetworkError: Bool {
        switch self {
        case .noNetwork, .timedOut: true
        default: false
        }
    }

    /// Una respuesta que no es 2xx, clasificada. El código manda; el status
    /// decide cuando no lo hay o la app no lo conoce.
    static func from(status: Int, body: Data) -> APIError {
        let problem = APIProblem.decode(body, status: status)
        if let problem, let decided = byCode(problem) { return decided }
        switch status {
        case 401: return .unauthenticated
        case 408, 429, 500...599: return .server(status: status)
        default: return problem.map(APIError.rejected) ?? .unreadableResponse
        }
    }

    /// Los códigos que deciden por sí mismos, sin mirar el status.
    private static func byCode(_ problem: APIProblem) -> APIError? {
        switch problem.code {
        case .sessionRevoked: .sessionRevoked
        case .sessionExpired, .invalidToken, .unauthenticated: .unauthenticated
        case .invalidCredentials, .wrongCurrentPassword: .rejected(problem)
        case .duplicate: .duplicate(problem)
        case .rateLimited, .serviceUnavailable, .internalError: .server(status: problem.status)
        default: nil
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
