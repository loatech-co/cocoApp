import Foundation

/// Everything that can go wrong when talking to the API, already classified so that
/// the queue decides without looking at HTTP codes. It is decided by the problem's
/// `code` and, if there is none or it is unknown, by the status.
enum APIError: Error, Equatable {
    case noNetwork(URLError.Code)
    case timedOut
    /// 401 that is fixed by refreshing: `session_expired`, `invalid_token`,
    /// `unauthenticated`, or a 401 without a known code.
    case unauthenticated
    /// 401 `session_revoked`: refreshing does not help, the session is closed.
    case sessionRevoked
    /// 409 `duplicate`: what was being sent already exists; it counts as done.
    case duplicate(APIProblem)
    /// The rest of 4xx (validation, someone else's, credentials, account): the request
    /// is wrong and repeating it does not help.
    case rejected(APIProblem)
    /// 5xx, 408 and 429: the server could not right now; later it will.
    case server(status: Int)
    /// An error response (not 2xx) that does not have the API's shape: an
    /// HTML page from a proxy, an empty body.
    case unreadableResponse
    /// A 2xx whose body cannot be read: the server DID what was asked and
    /// what is not known is the result. Repeating it could do it twice.
    case unreadableSuccess(status: Int)
    /// Whoever was waiting was cancelled —the budget ran out or iOS took back the
    /// task—. It is not a failure of the request and does not count as an attempt.
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

    /// A response that is not 2xx, classified. The code wins; the status
    /// decides when there is none or the app does not know it.
    static func from(status: Int, body: Data) -> APIError {
        let problem = APIProblem.decode(body, status: status)
        if let problem, let decided = byCode(problem) { return decided }
        switch status {
        case 401: return .unauthenticated
        case 408, 429, 500...599: return .server(status: status)
        default: return problem.map(APIError.rejected) ?? .unreadableResponse
        }
    }

    /// The codes that decide by themselves, without looking at the status.
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

    /// A `URLError` from the transport, classified.
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
