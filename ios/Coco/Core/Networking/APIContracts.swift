import Foundation

// Espejo de los esquemas de `api/openapi.v2.json`. Cada clave de la API se
// escribe en su `CodingKeys`, a la vista, aunque coincida con la propiedad:
// una diferencia con la API se ve ahí, no en un `keyDecodingStrategy` que la
// esconda. `APIKeysTests` falla si una clave cambia.

/// Lo único que la API cuenta de un usuario (`Profile` de la v2).
struct PublicProfile: Codable, Equatable, Sendable {
    let id: Int
    let email: String
    let displayName: String?
    let role: String
    let status: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, email, role, status, displayName, createdAt
    }
}

/// Respuesta de `/auth/login` y `/auth/refresh` (`Session` de la v2). El
/// `refreshToken` solo llega con la cabecera de cliente nativo.
struct SessionResponse: Decodable, Sendable {
    let accessToken: String
    let expiresIn: Int
    let user: PublicProfile
    let refreshToken: String?

    enum CodingKeys: String, CodingKey {
        case user, accessToken, expiresIn, refreshToken
    }
}

/// `Classification` de la v2. `confidence` llega como `high`, `medium` o
/// `none`; se guarda como cadena para que un valor nuevo no tumbe la lectura.
struct ProposedClassification: Codable, Equatable, Sendable {
    let confidence: String
    let source: String?
    let conceptId: Int?
    let categoryId: Int?
    let name: String?
    let candidates: [Candidate]
    let reason: String

    enum CodingKeys: String, CodingKey {
        case source, name, candidates, reason, conceptId, categoryId
        case confidence = "certainty"
    }

    struct Candidate: Codable, Equatable, Sendable {
        let id: Int
        let name: String
        let path: String
    }
}

/// Lo que `POST /transactions/interpret` entiende. Sin efectos.
struct Interpretation: Codable, Equatable, Sendable {
    let amount: String?
    let date: String?
    let merchant: String?
    let description: String?
    let classification: ProposedClassification
    let needsReview: Bool

    enum CodingKeys: String, CodingKey {
        case amount, date, merchant, description, classification, needsReview
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
        case id, date, amount, description, merchant, source, categoryId, needsReview
    }
}

/// Lo que devuelve `POST /transactions/capture` (`Capture` de la v2).
struct CaptureResponse: Codable, Equatable, Sendable {
    let transaction: TransactionSummary
    let classification: ProposedClassification
    let summary: String
    let duplicate: Bool
    let merged: Bool

    enum CodingKeys: String, CodingKey {
        case transaction, classification, summary
        case duplicate = "isDuplicate"
        case merged = "isMerged"
    }
}

/// La ficha de un soporte, no el archivo (`Receipt` de la v2).
struct Attachment: Codable, Equatable, Sendable {
    let id: Int
    let order: Int
    let fileName: String
    let mimeType: String
    let size: Int
    let available: Bool

    enum CodingKeys: String, CodingKey {
        case id, fileName, mimeType
        case order = "position"
        case size = "sizeBytes"
        case available = "isAvailable"
    }
}

/// Un nodo de `GET /categories` con sus hijos (`CategoryNode` recortado). Se
/// guarda en disco con estas mismas claves: es una copia del servidor, y si
/// no se deja leer se vuelve a bajar.
struct TreeNode: Codable, Equatable, Sendable {
    let id: Int
    let name: String
    let parentId: Int?
    let keywords: [String]
    let isArchived: Bool
    let isStatic: Bool
    let children: [TreeNode]?

    enum CodingKeys: String, CodingKey {
        case id, name, children, parentId, keywords, isArchived, isStatic
    }

    // `keywords` puede faltar en respuestas viejas: se toma vacío en vez
    // de tumbar el árbol entero.
    init(
        id: Int, name: String, parentId: Int?, keywords: [String] = [], isArchived: Bool = false,
        isStatic: Bool = false, children: [TreeNode]? = nil
    ) {
        self.id = id
        self.name = name
        self.parentId = parentId
        self.keywords = keywords
        self.isArchived = isArchived
        self.isStatic = isStatic
        self.children = children
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        parentId = try c.decodeIfPresent(Int.self, forKey: .parentId)
        keywords = try c.decodeIfPresent([String].self, forKey: .keywords) ?? []
        isArchived = try c.decodeIfPresent(Bool.self, forKey: .isArchived) ?? false
        isStatic = try c.decodeIfPresent(Bool.self, forKey: .isStatic) ?? false
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

/// Una página de una lista de la v2: `meta.{page, perPage, total}`.
struct Page<T: Decodable>: Decodable {
    struct Meta: Decodable {
        let page: Int
        let perPage: Int
        let total: Int
    }
    let data: [T]
    let meta: Meta
}

/// `source` de `CaptureInput`, sin `web`: por ahí no entra nada desde el
/// teléfono. La cola guarda en disco estos mismos valores.
enum CaptureSource: String, Codable, Sendable {
    case wallet
    case sms
    case iosManual = "ios_manual"
    case iosPhoto = "ios_photo"
}

/// Fuera del tipo para no anidar tres niveles (SwiftLint `nesting`).
extension ProposedClassification.Candidate {
    enum CodingKeys: String, CodingKey {
        case id, name, path
    }
}
