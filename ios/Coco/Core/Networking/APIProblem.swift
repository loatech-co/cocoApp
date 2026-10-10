import Foundation

/// The v2 `code`s the app decides something on. They are stable: the API
/// does not rename them once published (`api/src/common/errors/problem-codes.ts`).
/// The rest arrive as `.other` and are decided by the status.
enum ProblemCode: Equatable, Sendable {
    // Session
    case unauthenticated, invalidToken, sessionExpired, sessionRevoked
    case invalidCredentials, wrongCurrentPassword
    // Cuenta
    case accountNotEnabled, accountPendingApproval, accountSuspended
    // Captura
    case duplicate, validationFailed, invalidFields, splitsUnbalanced, amountBreaksSplits
    case accountNotOwned, categoryNotOwned, conceptArchived, costCenterCannotClassify
    // What gets retried
    case rateLimited, serviceUnavailable, internalError
    /// A code the app does not know.
    case other(String)

    private static let known: [String: ProblemCode] = [
        "unauthenticated": .unauthenticated, "invalid_token": .invalidToken,
        "session_expired": .sessionExpired, "session_revoked": .sessionRevoked,
        "invalid_credentials": .invalidCredentials, "wrong_current_password": .wrongCurrentPassword,
        "account_not_enabled": .accountNotEnabled, "account_pending_approval": .accountPendingApproval,
        "account_suspended": .accountSuspended, "duplicate": .duplicate,
        "validation_failed": .validationFailed, "invalid_fields": .invalidFields,
        "splits_unbalanced": .splitsUnbalanced, "amount_breaks_splits": .amountBreaksSplits,
        "account_not_owned": .accountNotOwned, "category_not_owned": .categoryNotOwned,
        "concept_archived": .conceptArchived, "cost_center_cannot_classify": .costCenterCannotClassify,
        "rate_limited": .rateLimited, "service_unavailable": .serviceUnavailable,
        "internal_error": .internalError,
    ]

    init(_ raw: String) {
        self = Self.known[raw] ?? .other(raw)
    }
}

/// An API error, read (RFC 9457, `application/problem+json`).
///
/// It accepts TWO shapes while the deployed v2 is not the one from #53: the new one
/// (`{type,title,status,detail,code,errors}`) and the old one
/// (`{error:{code,message,details}}`). What is neither of the two —an
/// HTML page from a proxy— is not decoded and stays `nil`.
struct APIProblem: Equatable, Sendable {
    struct FieldError: Equatable, Sendable, Decodable {
        /// The field path (`splits.0.amount`); without it, it is a standalone problem.
        let field: String?
        let message: String
    }

    let status: Int
    let code: ProblemCode
    let title: String
    /// The sentence for the person, in Spanish. It may change freely.
    let detail: String
    let errors: [FieldError]

    init(status: Int, code: ProblemCode, title: String = "", detail: String = "", errors: [FieldError] = []) {
        self.status = status
        self.code = code
        self.title = title
        self.detail = detail
        self.errors = errors
    }

    /// `status` is the HTTP response's: it wins over the body's.
    static func decode(_ data: Data, status: Int) -> APIProblem? {
        let decoder = JSONDecoder()
        if let p = try? decoder.decode(ProblemBody.self, from: data) {
            return APIProblem(
                status: status, code: ProblemCode(p.code), title: p.title ?? "", detail: p.detail ?? "",
                errors: p.errors ?? [])
        }
        return nil
    }

    /// What the person is shown: our own text for the codes that
    /// call for saying what to do; otherwise, the API's sentence; otherwise, `fallback`.
    func userMessage(fallback: String = L10n.Queue.errorGeneric) -> String {
        switch code {
        case .sessionExpired, .invalidToken, .unauthenticated: return L10n.Problem.sessionExpired
        case .sessionRevoked: return L10n.Problem.sessionRevoked
        case .invalidCredentials: return L10n.Session.errorBadCredentials
        case .accountPendingApproval: return L10n.Problem.accountPendingApproval
        case .accountSuspended: return L10n.Problem.accountSuspended
        case .accountNotEnabled: return L10n.Problem.accountNotEnabled
        case .rateLimited: return L10n.Session.errorTooManyAttempts
        default:
            if !detail.isEmpty { return detail }
            return title.isEmpty ? fallback : title
        }
    }
}

/// The `problem+json` body as it arrives. `code` is the only mandatory thing:
/// without it there is no way to decide and it is not treated as a v2 problem.
private struct ProblemBody: Decodable {
    let code: String
    let title: String?
    let detail: String?
    let errors: [APIProblem.FieldError]?
}
