import Foundation

// Mirror of the schemas of `api/openapi.v2.json`. Each API key is
// written in its `CodingKeys`, in plain sight, even if it matches the property:
// a difference with the API shows there, not in a `keyDecodingStrategy` that
// hides it. `APIKeysTests` fails if a key changes.

/// The only thing the API tells about a user (`Profile` of the v2).
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

/// Response of `/auth/login` and `/auth/refresh` (`Session` of the v2). The
/// `refreshToken` only arrives with the native client header.
struct SessionResponse: Decodable, Sendable {
    let accessToken: String
    let expiresIn: Int
    let user: PublicProfile
    let refreshToken: String?

    enum CodingKeys: String, CodingKey {
        case user, accessToken, expiresIn, refreshToken
    }
}

/// `Classification` of the v2. `confidence` arrives as `high`, `medium` or
/// `none`; it is kept as a string so that a new value does not break the read.
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

/// What `POST /transactions/interpret` understands. No side effects.
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

/// What the app needs from a `Transaction`; the rest is ignored when decoding.
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

/// What `POST /transactions/capture` returns (`Capture` of the v2).
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

/// The record of a receipt, not the file (`Receipt` of the v2).
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

/// A node of `GET /categories` with its children (`CategoryNode`, trimmed). It is
/// saved on disk with these same keys: it is a copy of the server's, and if
/// it cannot be read it is downloaded again.
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

    // `keywords` may be missing in old responses: it is taken as empty instead
    // of breaking the whole tree.
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

/// The `{data, meta}` envelope the TransformInterceptor builds.
struct Envelope<T: Decodable>: Decodable {
    let data: T
}

/// A page of a v2 list: `meta.{page, perPage, total}`.
struct Page<T: Decodable>: Decodable {
    struct Meta: Decodable {
        let page: Int
        let perPage: Int
        let total: Int
    }
    let data: [T]
    let meta: Meta
}

/// `source` of `CaptureInput`, without `web`: nothing comes in that way from the
/// phone. The queue saves these same values on disk.
enum CaptureSource: String, Codable, Sendable {
    case wallet
    case sms
    case iosManual = "ios_manual"
    case iosPhoto = "ios_photo"
}

/// Outside the type so as not to nest three levels (SwiftLint `nesting`).
extension ProposedClassification.Candidate {
    enum CodingKeys: String, CodingKey {
        case id, name, path
    }
}
