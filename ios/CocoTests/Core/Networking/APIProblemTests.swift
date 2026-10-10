import XCTest

@testable import Coco

/// The v2 errors (`application/problem+json`) and the v1 ones
/// (`{error:{…}}`), read and classified by their `code`.
final class APIProblemTests: XCTestCase {
    /// A v2 problem just as the API sends it (#53).
    static func problem(_ status: Int, _ code: String, detail: String = "Frase de la API", errors: String? = nil)
        -> String
    {
        let fields = errors.map { #","errors":\#($0)"# } ?? ""
        return
            #"{"type":"https://dev-cocoapp.viteri.me/problems/\#(code)","title":"Título","status":\#(status),"detail":"\#(detail)","code":"\#(code)"\#(fields)}"#
    }

    private func error(_ status: Int, _ body: String) async -> APIError? {
        let base = URL(string: "https://api.coco.invalid") ?? URL(fileURLWithPath: "/")
        let client = APIClient(
            configuration: APIConfiguration(base: base), transport: FakeTransport([.http(status, body)]),
            version: "0.1.0")
        do {
            let _: [TreeNode] = try await client.send(RequestBuilder.categories(page: 1), token: "tok")
            return nil
        } catch {
            return error as? APIError
        }
    }

    // MARK: Reading

    func testReadsAProblemWithItsFieldErrors() throws {
        let body = Self.problem(
            400, "invalid_fields", detail: "Hay campos inválidos",
            errors: #"[{"field":"splits.0.amount","message":"Debe ser positivo"},{"message":"Suelto"}]"#)
        let p = try XCTUnwrap(APIProblem.decode(Data(body.utf8), status: 400))
        XCTAssertEqual(p.status, 400)
        XCTAssertEqual(p.code, .invalidFields)
        XCTAssertEqual(p.title, "Título")
        XCTAssertEqual(p.detail, "Hay campos inválidos")
        XCTAssertEqual(
            p.errors,
            [
                .init(field: "splits.0.amount", message: "Debe ser positivo"),
                .init(field: nil, message: "Suelto"),
            ])
    }

    /// The shape of the retired v1 (`{error:{…}}`) is no longer a problem.
    func testTheRetiredShapeIsNotAProblem() {
        let body = #"{"error":{"code":"VALIDACION","message":"Falta el monto","details":[]}}"#
        XCTAssertNil(APIProblem.decode(Data(body.utf8), status: 422))
    }

    func testWhatIsNotAProblemIsNil() {
        for body in ["<html><body>502 Bad Gateway</body></html>", "", "{}", #"{"message":"x"}"#] {
            XCTAssertNil(APIProblem.decode(Data(body.utf8), status: 502), body)
        }
    }

    func testAnUnknownCodeIsKeptAsIs() {
        XCTAssertEqual(ProblemCode("something_new"), .other("something_new"))
        XCTAssertEqual(ProblemCode("amount_breaks_splits"), .amountBreaksSplits)
    }

    // MARK: Families

    func testSessionCodesRenewAndARevokedSessionDoesNot() async {
        for code in ["session_expired", "invalid_token", "unauthenticated"] {
            let e = await error(401, Self.problem(401, code))
            XCTAssertEqual(e, .unauthenticated, code)
        }
        let revoked = await error(401, Self.problem(401, "session_revoked"))
        XCTAssertEqual(revoked, .sessionRevoked)
        XCTAssertEqual(revoked?.isRetryable, false)
    }

    /// Bad credentials are a 401, but not a session one: refreshing does not help.
    func testBadCredentialsAreRejectedNotRenewed() async {
        let e = await error(401, Self.problem(401, "invalid_credentials"))
        guard case .rejected(let p) = e else { return XCTFail("\(String(describing: e))") }
        XCTAssertEqual(p.code, .invalidCredentials)
        XCTAssertEqual(SignInView.message(from: APIError.rejected(p)), L10n.Session.errorBadCredentials)
    }

    func testValidationIsRejectedWithTheSentenceOfTheAPI() async {
        struct Case {
            let status: Int
            let code: String
            let expected: ProblemCode
        }
        let cases = [
            Case(status: 422, code: "validation_failed", expected: .validationFailed),
            Case(status: 422, code: "amount_breaks_splits", expected: .amountBreaksSplits),
            Case(status: 422, code: "category_not_owned", expected: .categoryNotOwned),
            Case(status: 400, code: "invalid_fields", expected: .invalidFields),
            Case(status: 422, code: "a_rule_the_app_does_not_know", expected: .other("a_rule_the_app_does_not_know")),
        ]
        for c in cases {
            let (status, code, expected) = (c.status, c.code, c.expected)
            let e = await error(status, Self.problem(status, code, detail: "No cuadra"))
            XCTAssertEqual(
                e, .rejected(APIProblem(status: status, code: expected, title: "Título", detail: "No cuadra")), code)
            XCTAssertEqual(e?.isRetryable, false, code)
        }
    }

    func testDuplicateIsItsOwnFamily() async {
        let e = await error(409, Self.problem(409, "duplicate", detail: "Ya existe"))
        guard case .duplicate(let p) = e else { return XCTFail("\(String(describing: e))") }
        XCTAssertEqual(p.detail, "Ya existe")
        XCTAssertEqual(e?.isRetryable, false)
    }

    func testRateLimitAndServerFailuresAreRetried() async {
        for (status, code) in [(429, "rate_limited"), (503, "service_unavailable"), (500, "internal_error")] {
            let e = await error(status, Self.problem(status, code))
            XCTAssertEqual(e, .server(status: status), code)
            XCTAssertEqual(e?.isRetryable, true, code)
        }
    }

    /// A proxy that answers HTML breaks nothing: a 5xx is still
    /// retryable and a 4xx falls into the generic error.
    func testAnHTMLErrorFallsBackByStatus() async {
        let html = "<html><body>Error</body></html>"
        let bad = await error(502, html)
        XCTAssertEqual(bad, .server(status: 502))
        let rejected = await error(403, html)
        XCTAssertEqual(rejected, .unreadableResponse)
        let unauthorized = await error(401, html)
        XCTAssertEqual(unauthorized, .unauthenticated)
    }

    // MARK: What the person sees

    func testTheMessageIsTheDetailOrTheCatalogText() {
        func message(_ code: ProblemCode, detail: String = "Frase de la API", title: String = "") -> String {
            APIProblem(status: 400, code: code, title: title, detail: detail).userMessage()
        }
        XCTAssertEqual(message(.amountBreaksSplits), "Frase de la API")
        XCTAssertEqual(message(.sessionExpired), L10n.Problem.sessionExpired)
        XCTAssertEqual(message(.sessionRevoked), L10n.Problem.sessionRevoked)
        XCTAssertEqual(message(.accountPendingApproval), L10n.Problem.accountPendingApproval)
        XCTAssertEqual(message(.accountSuspended), L10n.Problem.accountSuspended)
        XCTAssertEqual(message(.accountNotEnabled), L10n.Problem.accountNotEnabled)
        XCTAssertEqual(message(.other("x"), detail: "", title: "Título"), "Título")
        XCTAssertEqual(message(.other("x"), detail: ""), L10n.Queue.errorGeneric)
        XCTAssertTrue(L10n.Problem.accountPendingApproval.contains("pendiente de aprobación"))
    }

    func testSignInShowsTheCatalogTextForAPendingAccount() {
        let e = APIError.rejected(APIProblem(status: 403, code: .accountPendingApproval, detail: "x"))
        XCTAssertEqual(SignInView.message(from: e), L10n.Problem.accountPendingApproval)
        let empty = APIError.rejected(APIProblem(status: 400, code: .other("x")))
        XCTAssertEqual(SignInView.message(from: empty), L10n.Session.errorRejected)
    }
}
