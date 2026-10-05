import Foundation

/// Una petición a la API, todavía sin base, token ni User-Agent: lo que la
/// distingue de las demás y nada más.
struct APIRequest: Sendable {
    var method: String
    /// Relativa a `/api/v2`: "/auth/login".
    var path: String
    /// La consulta, aparte de la ruta: `appending(path:)` escaparía el `?`.
    var query: [URLQueryItem] = []
    var jsonBody: Data?
    var headers: [String: String] = [:]
    /// Solo `/auth/login`, `/auth/refresh` y `/auth/logout` llevan
    /// `X-Coco-Client: native`; es lo que hace que el refresh viaje en el
    /// cuerpo y no en una cookie.
    var nativeClient: Bool = false
    var timeout: Duration = .seconds(15)
}

struct MultipartPart: Sendable {
    /// "files": el campo multipart de `/transactions/:id/receipts`.
    let fieldName: String
    let fileName: String
    let mime: String
    let data: Data
}

/// Construye peticiones. Puro: se prueba sin transporte.
enum RequestBuilder {
    static let nativeClientHeader = "X-Coco-Client"
    static let nativeClient = "native"
    static let attachmentsField = "files"

    static func urlRequest(_ p: APIRequest, base: URL, token: String?, userAgent: String) -> URLRequest {
        let path = p.path.hasPrefix("/") ? String(p.path.dropFirst()) : p.path
        var url = base.appending(path: path)
        if !p.query.isEmpty { url.append(queryItems: p.query) }
        var r = URLRequest(url: url)
        r.httpMethod = p.method
        r.timeoutInterval = TimeInterval(p.timeout.components.seconds)
        r.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body = p.jsonBody {
            r.httpBody = body
            if p.headers["Content-Type"] == nil {
                r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            }
        }
        for (key, value) in p.headers { r.setValue(value, forHTTPHeaderField: key) }
        if p.nativeClient { r.setValue(nativeClient, forHTTPHeaderField: nativeClientHeader) }
        // El token va en la cabecera y nunca en la URL: una query con
        // credenciales acaba en bitácoras y en el historial.
        if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return r
    }

    static func login(email: String, password: String) -> APIRequest {
        APIRequest(
            method: "POST", path: "/auth/login", jsonBody: json(["email": email, "password": password]),
            nativeClient: true)
    }

    static func refresh(refreshToken: String) -> APIRequest {
        APIRequest(
            method: "POST", path: "/auth/refresh", jsonBody: json(["refreshToken": refreshToken]),
            nativeClient: true)
    }

    static func logout(refreshToken: String) -> APIRequest {
        APIRequest(
            method: "POST", path: "/auth/logout", jsonBody: json(["refreshToken": refreshToken]), nativeClient: true
        )
    }

    static func capture(_ r: CaptureRequest) -> APIRequest {
        APIRequest(method: "POST", path: "/transactions/capture", jsonBody: try? jsonEncoder.encode(r))
    }

    static func interpret(_ c: CaptureBody) -> APIRequest {
        APIRequest(
            method: "POST", path: "/transactions/interpret",
            jsonBody: try? jsonEncoder.encode(InterpretRequest(body: c))
        )
    }

    /// El tope de la v2 por página. El árbol se pagina por centros de costos,
    /// así que casi siempre cabe en una.
    static let maxPerPage = 200

    /// Una página del árbol: `data` son centros de costos con sus hijos.
    static func categories(page: Int) -> APIRequest {
        APIRequest(
            method: "GET", path: "/categories",
            query: [
                URLQueryItem(name: "page", value: "\(page)"), URLQueryItem(name: "perPage", value: "\(maxPerPage)"),
            ])
    }

    static func receiptsPath(transactionId: Int) -> String {
        "/transactions/\(transactionId)/receipts"
    }

    /// `multipart/form-data` armado a mano: URLSession no lo hace.
    static func multipart(path: String, parts: [MultipartPart], boundary: String) -> APIRequest {
        var body = Data()
        for part in parts {
            body.append("--\(boundary)\r\n")
            body.append("Content-Disposition: form-data; name=\"\(part.fieldName)\"; ")
            body.append("filename=\"\(part.fileName)\"\r\n")
            body.append("Content-Type: \(part.mime)\r\n\r\n")
            body.append(part.data)
            body.append("\r\n")
        }
        body.append("--\(boundary)--\r\n")
        return APIRequest(
            method: "POST",
            path: path,
            jsonBody: body,
            headers: ["Content-Type": "multipart/form-data; boundary=\(boundary)"],
            timeout: .seconds(60)
        )
    }

    private static let jsonEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    private static func json(_ object: [String: String]) -> Data? {
        try? jsonEncoder.encode(object)
    }
}

extension Data {
    fileprivate mutating func append(_ text: String) {
        append(Data(text.utf8))
    }
}
