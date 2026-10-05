import Foundation

/// Una petición a la API, todavía sin base, token ni User-Agent: lo que la
/// distingue de las demás y nada más.
struct APIRequest: Sendable {
    var metodo: String
    /// Relativa a `/api/v1`: "/auth/login".
    var ruta: String
    var cuerpoJSON: Data?
    var cabeceras: [String: String] = [:]
    /// Solo `/auth/login`, `/auth/refresh` y `/auth/logout` llevan
    /// `X-Coco-Cliente: nativo`; es lo que hace que el refresh viaje en el
    /// cuerpo y no en una cookie.
    var clienteNativo: Bool = false
    var tiempoMaximo: Duration = .seconds(15)
}

struct MultipartPart: Sendable {
    /// "archivos" (`CONTRATO_DE_SOPORTES.campo`).
    let nombreDelCampo: String
    let nombreDeArchivo: String
    let mime: String
    let datos: Data
}

/// Construye peticiones. Puro: se prueba sin transporte.
enum RequestBuilder {
    static let cabeceraClienteNativo = "X-Coco-Cliente"
    static let clienteNativo = "nativo"
    static let campoDeSoportes = "archivos"

    static func urlRequest(_ p: APIRequest, base: URL, token: String?, userAgent: String) -> URLRequest {
        let ruta = p.ruta.hasPrefix("/") ? String(p.ruta.dropFirst()) : p.ruta
        var r = URLRequest(url: base.appending(path: ruta))
        r.httpMethod = p.metodo
        r.timeoutInterval = TimeInterval(p.tiempoMaximo.components.seconds)
        r.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let cuerpo = p.cuerpoJSON {
            r.httpBody = cuerpo
            if p.cabeceras["Content-Type"] == nil {
                r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            }
        }
        for (clave, valor) in p.cabeceras { r.setValue(valor, forHTTPHeaderField: clave) }
        if p.clienteNativo { r.setValue(clienteNativo, forHTTPHeaderField: cabeceraClienteNativo) }
        // El token va en la cabecera y nunca en la URL: una query con
        // credenciales acaba en bitácoras y en el historial.
        if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return r
    }

    static func login(correo: String, contrasena: String) -> APIRequest {
        APIRequest(
            metodo: "POST", ruta: "/auth/login", cuerpoJSON: json(["email": correo, "password": contrasena]),
            clienteNativo: true)
    }

    static func refresh(refreshToken: String) -> APIRequest {
        APIRequest(
            metodo: "POST", ruta: "/auth/refresh", cuerpoJSON: json(["refresh_token": refreshToken]),
            clienteNativo: true)
    }

    static func logout(refreshToken: String) -> APIRequest {
        APIRequest(
            metodo: "POST", ruta: "/auth/logout", cuerpoJSON: json(["refresh_token": refreshToken]), clienteNativo: true
        )
    }

    static func capturar(_ r: CaptureRequest) -> APIRequest {
        APIRequest(metodo: "POST", ruta: "/transactions/capture", cuerpoJSON: try? codificador.encode(r))
    }

    static func interpretar(_ c: CaptureBody) -> APIRequest {
        APIRequest(metodo: "POST", ruta: "/transactions/interpret", cuerpoJSON: try? codificador.encode(c))
    }

    static func categorias() -> APIRequest {
        APIRequest(metodo: "GET", ruta: "/categories")
    }

    /// `multipart/form-data` armado a mano: URLSession no lo hace.
    static func multipart(ruta: String, partes: [MultipartPart], frontera: String) -> APIRequest {
        var cuerpo = Data()
        for parte in partes {
            cuerpo.append("--\(frontera)\r\n")
            cuerpo.append("Content-Disposition: form-data; name=\"\(parte.nombreDelCampo)\"; ")
            cuerpo.append("filename=\"\(parte.nombreDeArchivo)\"\r\n")
            cuerpo.append("Content-Type: \(parte.mime)\r\n\r\n")
            cuerpo.append(parte.datos)
            cuerpo.append("\r\n")
        }
        cuerpo.append("--\(frontera)--\r\n")
        return APIRequest(
            metodo: "POST",
            ruta: ruta,
            cuerpoJSON: cuerpo,
            cabeceras: ["Content-Type": "multipart/form-data; boundary=\(frontera)"],
            tiempoMaximo: .seconds(60)
        )
    }

    private static let codificador: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    private static func json(_ objeto: [String: String]) -> Data? {
        try? codificador.encode(objeto)
    }
}

extension Data {
    fileprivate mutating func append(_ texto: String) {
        append(Data(texto.utf8))
    }
}
