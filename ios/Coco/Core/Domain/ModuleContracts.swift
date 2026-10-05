import Foundation

// Lo que cruza módulos. Cada módulo compila contra estos protocolos y se
// prueba con dobles, sin esperar a los demás.

// MARK: Sesión

enum SessionState: Equatable, Sendable {
    case loading
    case signedOut
    case active(PublicProfile)
    case offline(last: PublicProfile?)
}

/// Lo que el puente entrega a la web: `SesionParaLaWeb` de @coco/types, con el
/// perfil como JSON crudo para no reescribir ni una clave.
struct WebSession: Sendable {
    let accessToken: String
    let expiresIn: Int
    let userJSON: Data

    func asDictionary() throws -> [String: Any] {
        let user = try JSONSerialization.jsonObject(with: userJSON)
        return ["access_token": accessToken, "expires_in": expiresIn, "user": user]
    }
}

enum SessionError: Error, Equatable {
    case signedOut
    case offline
    case originNotAllowed
}

protocol Session: AnyObject, Sendable {
    var state: SessionState { get async }
    var changes: AsyncStream<SessionState> { get }
    func restore() async
    func signIn(email: String, password: String) async throws -> PublicProfile
    /// Renueva si quedan <120 s; una sola renovación en vuelo (single-flight).
    func validAccessToken() async throws -> String
    /// Tras un 401 inesperado.
    func refreshNow() async throws
    func webSession() async throws -> WebSession
    func signOut() async
    func discard() async
}

// MARK: Red

protocol Transport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

// MARK: Capturas

struct SavedResult: Codable, Equatable, Sendable {
    let transactionId: Int
    let summary: String
    let duplicate: Bool
    let merged: Bool
    let needsReview: Bool
    let finishedAt: Date

    /// Se guarda en disco dentro de la cola: las claves no cambian.
    enum CodingKeys: String, CodingKey {
        case transactionId
        case summary = "resumen"
        case duplicate = "repetido"
        case merged = "fusionado"
        case needsReview = "porRevisar"
        case finishedAt = "terminadaEn"
    }
}

enum CaptureResult: Equatable, Sendable {
    case sent(SavedResult)
    case queued(pending: Int)
    case failed(reason: String)
}

protocol Capturer: Sendable {
    func capture(_ body: CaptureBody, source: CaptureSource, photo: Data?, budget: Duration) async
        -> CaptureResult
}

protocol QueueStore: Sendable {
    func save(_ capture: PendingCapture) throws
    func all() throws -> [PendingCapture]
    func delete(id: UUID) throws
    func savePhoto(_ jpeg: Data, id: UUID) throws -> String
    func photo(at path: String) throws -> Data
    func deletePhoto(at path: String) throws
    func photoBytes() throws -> Int
}

protocol CaptureSender: Sendable {
    /// POST /transactions/capture
    func capture(_ r: CaptureRequest) async throws -> CaptureResponse
    /// POST /transactions/:id/soportes
    func uploadPhoto(_ jpeg: Data, name: String, to transactionId: Int) async throws -> [Attachment]
}

// MARK: Avisos

protocol Notifier: Sendable {
    func requestPermission() async -> Bool
    func captureSaved(_ r: SavedResult, source: CaptureSource) async
    func captureFailed(reason: String) async
    func queueSent(count: Int) async
    func scheduleExpiry(_ expiresAt: Date, text: String) async
    func setBadge(_ n: Int) async
}

// MARK: Navegación

enum Destination: Equatable, Sendable {
    case quickForm(withCamera: Bool)
    case captures
    case web(path: String)
    case search
    case welcome
    case settings
}

protocol Navigation: AnyObject, Sendable {
    @MainActor func go(_ destination: Destination)
}

// MARK: Árbol

protocol TreeStore: Sendable {
    func load() throws -> SavedTree?
    func save(_ tree: SavedTree) throws
}
