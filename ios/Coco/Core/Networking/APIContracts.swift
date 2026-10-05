import Foundation

// Espejo de packages/types/src/index.ts. Las propiedades van en camelCase y
// cada clave de la API se escribe en su `CodingKeys`, a la vista: una
// diferencia con la API se ve ahí, no en un `keyDecodingStrategy` que la
// esconda. `StoredFormatCompatibilityTests` falla si una clave cambia.

/// Lo único que la API cuenta de un usuario (`PerfilPublico` de @coco/types).
struct PublicProfile: Codable, Equatable, Sendable {
    let id: Int
    let email: String
    let displayName: String?
    let role: String
    let status: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, email, role, status
        case displayName = "display_name"
        case createdAt = "created_at"
    }
}

/// Respuesta de `/auth/login` y `/auth/refresh` (`SesionResponse`). El
/// `refresh_token` solo llega con la cabecera de cliente nativo.
struct SessionResponse: Decodable, Sendable {
    let accessToken: String
    let expiresIn: Int
    let user: PublicProfile
    let refreshToken: String?

    enum CodingKeys: String, CodingKey {
        case user
        case accessToken = "access_token"
        case expiresIn = "expires_in"
        case refreshToken = "refresh_token"
    }
}

struct ProposedClassification: Codable, Equatable, Sendable {
    let certeza: String
    let fuente: String?
    let conceptId: Int?
    let categoryId: Int?
    let nombre: String?
    let candidatos: [Candidate]
    let motivo: String

    enum CodingKeys: String, CodingKey {
        case certeza, fuente, nombre, candidatos, motivo
        case conceptId = "concepto_id"
        case categoryId = "categoria_id"
    }

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
    let needsReview: Bool

    enum CodingKeys: String, CodingKey {
        case amount, date, merchant, description, clasificacion
        case needsReview = "por_revisar"
    }
}

/// Lo que la app necesita de un `Transaction`; el resto se ignora al decodificar.
struct TransactionSummary: Codable, Equatable, Sendable {
    let id: Int
    let date: String
    let amount: String
    let categoryId: Int?
    let description: String?
    let merchant: String?
    let source: String
    let needsReview: Bool

    enum CodingKeys: String, CodingKey {
        case id, date, amount, description, merchant, source
        case categoryId = "category_id"
        case needsReview = "por_revisar"
    }
}

/// Lo que devuelve `POST /transactions/capture` (`Captura` de @coco/types).
struct CaptureResponse: Codable, Equatable, Sendable {
    let transaction: TransactionSummary
    let clasificacion: ProposedClassification
    let resumen: String
    let repetido: Bool
    let fusionado: Bool
}

/// La ficha de un soporte, no el archivo (`Soporte` de @coco/types).
struct Attachment: Codable, Equatable, Sendable {
    let id: Int
    let orden: Int
    let fileName: String
    let mimeType: String
    let tamano: Int
    let disponible: Bool

    enum CodingKeys: String, CodingKey {
        case id, orden, tamano, disponible
        case fileName = "nombre_archivo"
        case mimeType = "mime_type"
    }
}

/// Un nodo de `GET /categories` con sus hijos (`Category` recortada).
struct TreeNode: Codable, Equatable, Sendable {
    let id: Int
    let name: String
    let parentId: Int?
    let keywords: [String]
    let isArchived: Bool
    let estatico: Bool
    let children: [TreeNode]?

    enum CodingKeys: String, CodingKey {
        case id, name, estatico, children
        case parentId = "parent_id"
        case keywords = "palabras_clave"
        case isArchived = "is_archived"
    }

    // `palabras_clave` puede faltar en respuestas viejas: se toma vacío en vez
    // de tumbar el árbol entero.
    init(
        id: Int, name: String, parentId: Int?, keywords: [String] = [], isArchived: Bool = false,
        estatico: Bool = false, children: [TreeNode]? = nil
    ) {
        self.id = id
        self.name = name
        self.parentId = parentId
        self.keywords = keywords
        self.isArchived = isArchived
        self.estatico = estatico
        self.children = children
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        parentId = try c.decodeIfPresent(Int.self, forKey: .parentId)
        keywords = try c.decodeIfPresent([String].self, forKey: .keywords) ?? []
        isArchived = try c.decodeIfPresent(Bool.self, forKey: .isArchived) ?? false
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
