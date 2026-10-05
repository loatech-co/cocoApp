import Foundation

// Espejo de packages/types/src/index.ts. Las claves se dejan en snake_case a
// propósito: una diferencia con la API se ve en el nombre, no en un
// `keyDecodingStrategy` que la esconda.

/// Lo único que la API cuenta de un usuario (`PublicProfile`).
struct PublicProfile: Codable, Equatable, Sendable {
    let id: Int
    let email: String
    let display_name: String?
    let role: String
    let status: String
    let created_at: String
}

/// Respuesta de `/auth/login` y `/auth/refresh` (`SesionResponse`). El
/// `refresh_token` solo llega con la cabecera de cliente nativo.
struct SessionResponse: Decodable, Sendable {
    let access_token: String
    let expires_in: Int
    let user: PublicProfile
    let refresh_token: String?
}

struct ProposedClassification: Codable, Equatable, Sendable {
    let certeza: String
    let fuente: String?
    let concepto_id: Int?
    let categoria_id: Int?
    let nombre: String?
    let candidatos: [Candidate]
    let motivo: String

    struct Candidate: Codable, Equatable, Sendable {
        let id: Int
        let nombre: String
        let ruta: String
    }
}

/// Lo que `POST /transactions/interpret` entiende. Sin efectos.
struct Interpretation: Codable, Equatable, Sendable {
    let amount: String?
    let date: String?
    let merchant: String?
    let description: String?
    let clasificacion: ProposedClassification
    let por_revisar: Bool
}

/// Lo que la app necesita de un `Transaction`; el resto se ignora al decodificar.
struct TransactionSummary: Codable, Equatable, Sendable {
    let id: Int
    let date: String
    let amount: String
    let category_id: Int?
    let description: String?
    let merchant: String?
    let source: String
    let por_revisar: Bool
}

/// Lo que devuelve `POST /transactions/capture` (`CaptureResponse`).
struct CaptureResponse: Codable, Equatable, Sendable {
    let transaction: TransactionSummary
    let clasificacion: ProposedClassification
    let resumen: String
    let repetido: Bool
    let fusionado: Bool
}

/// La ficha de un soporte, no el archivo (`Attachment`).
struct Attachment: Codable, Equatable, Sendable {
    let id: Int
    let orden: Int
    let nombre_archivo: String
    let mime_type: String
    let tamano: Int
    let disponible: Bool
}

/// Un nodo de `GET /categories` con sus hijos (`Category` recortada).
struct TreeNode: Codable, Equatable, Sendable {
    let id: Int
    let name: String
    let parent_id: Int?
    let palabras_clave: [String]
    let is_archived: Bool
    let estatico: Bool
    let children: [TreeNode]?

    // `palabras_clave` puede faltar en respuestas viejas: se toma vacío en vez
    // de tumbar el árbol entero.
    init(
        id: Int, name: String, parent_id: Int?, palabras_clave: [String] = [], is_archived: Bool = false,
        estatico: Bool = false, children: [TreeNode]? = nil
    ) {
        self.id = id
        self.name = name
        self.parent_id = parent_id
        self.palabras_clave = palabras_clave
        self.is_archived = is_archived
        self.estatico = estatico
        self.children = children
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        parent_id = try c.decodeIfPresent(Int.self, forKey: .parent_id)
        palabras_clave = try c.decodeIfPresent([String].self, forKey: .palabras_clave) ?? []
        is_archived = try c.decodeIfPresent(Bool.self, forKey: .is_archived) ?? false
        estatico = try c.decodeIfPresent(Bool.self, forKey: .estatico) ?? false
        children = try c.decodeIfPresent([TreeNode].self, forKey: .children)
    }
}

/// El cuerpo de un error de la API: `{error:{code,message,details}}`.
struct APIErrorBody: Decodable, Sendable {
    struct Detail: Decodable, Sendable {
        let code: String
        let message: String
    }
    let error: Detail
}

/// El sobre `{data, meta}` que arma el TransformInterceptor.
struct Envelope<T: Decodable>: Decodable {
    let data: T
}

/// `TRANSACTION_SOURCES`, sin `web`: por ahí no entra nada desde el teléfono.
enum CaptureSource: String, Codable, Sendable {
    case wallet
    case sms
    case iosManual = "ios_manual"
    case iosFoto = "ios_photo"
}
