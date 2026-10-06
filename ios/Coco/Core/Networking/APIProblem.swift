import Foundation

/// Los `code` de la v2 sobre los que la app decide algo. Son estables: la API
/// no los renombra una vez publicados (`api/src/common/errors/problem-codes.ts`).
/// El resto llega como `.other` y se decide por el status.
enum ProblemCode: Equatable, Sendable {
    // Sesión
    case unauthenticated, invalidToken, sessionExpired, sessionRevoked
    case invalidCredentials, wrongCurrentPassword
    // Cuenta
    case accountNotEnabled, accountPendingApproval, accountSuspended
    // Captura
    case duplicate, validationFailed, invalidFields, splitsUnbalanced, amountBreaksSplits
    case accountNotOwned, categoryNotOwned, conceptArchived, costCenterCannotClassify
    // Lo que se reintenta
    case rateLimited, serviceUnavailable, internalError
    /// Un código que la app no conoce.
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

/// Un error de la API leído (RFC 9457, `application/problem+json`).
///
/// Acepta DOS formas mientras la v2 desplegada no sea la del #53: la nueva
/// (`{type,title,status,detail,code,errors}`) y la vieja
/// (`{error:{code,message,details}}`). Lo que no es ninguna de las dos —una
/// página HTML de un proxy— no se decodifica y queda en `nil`.
struct APIProblem: Equatable, Sendable {
    struct FieldError: Equatable, Sendable, Decodable {
        /// La ruta del campo (`splits.0.amount`); sin ella es un problema suelto.
        let field: String?
        let message: String
    }

    let status: Int
    let code: ProblemCode
    let title: String
    /// La frase para la persona, en español. Puede cambiar libremente.
    let detail: String
    let errors: [FieldError]

    init(status: Int, code: ProblemCode, title: String = "", detail: String = "", errors: [FieldError] = []) {
        self.status = status
        self.code = code
        self.title = title
        self.detail = detail
        self.errors = errors
    }

    /// `status` es el de la respuesta HTTP: manda sobre el del cuerpo.
    static func decode(_ data: Data, status: Int) -> APIProblem? {
        let decoder = JSONDecoder()
        if let p = try? decoder.decode(ProblemBody.self, from: data) {
            return APIProblem(
                status: status, code: ProblemCode(p.code), title: p.title ?? "", detail: p.detail ?? "",
                errors: p.errors ?? [])
        }
        return nil
    }

    /// Lo que se le enseña a la persona: un texto propio para los códigos que
    /// piden decir qué hacer; si no, la frase de la API; si no, `fallback`.
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

/// El cuerpo `problem+json` tal como llega. `code` es lo único obligatorio:
/// sin él no hay forma de decidir y no se trata como un problema de la v2.
private struct ProblemBody: Decodable {
    let code: String
    let title: String?
    let detail: String?
    let errors: [APIProblem.FieldError]?
}
