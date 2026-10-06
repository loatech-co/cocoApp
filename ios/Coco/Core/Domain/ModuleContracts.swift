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
/// perfil como JSON crudo para no tocar más que lo necesario.
///
/// El puente lo define la web, que sigue en la `v1`: la app habla con la v2
/// pero entrega el perfil con las claves de la v1 (`webProfileKeys`). Cuando
/// la web pase a la v2, la tabla se borra y el perfil viaja tal cual llegó.
struct WebSession: Sendable {
    let accessToken: String
    let expiresIn: Int
    let userJSON: Data

    /// Claves del `Profile` de la v2 que la `PerfilPublico` de la v1 escribe
    /// distinto. Las demás (`id`, `email`, `role`, `status`) son iguales.
    static let webProfileKeys = ["displayName": "display_name", "createdAt": "created_at"]

    func asDictionary() throws -> [String: Any] {
        var user = try JSONSerialization.jsonObject(with: userJSON)
        if let profile = user as? [String: Any] {
            user = Dictionary(
                profile.map { (Self.webProfileKeys[$0.key] ?? $0.key, $0.value) }, uniquingKeysWith: { a, _ in a })
        }
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
    // Se guarda en disco dentro de la cola con las claves sintetizadas (los
    // nombres de las propiedades). Las fija `StoredFormatTests`.
}

enum CaptureResult: Equatable, Sendable {
    case sent(SavedResult)
    case queued(pending: Int)
    /// Llegó a la API, pero su respuesta no se pudo leer: hay que revisarla.
    case unconfirmed
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
    /// Cuántos archivos de la cola se apartaron por no poder leerse.
    func quarantined() throws -> Int
}

protocol CaptureSender: Sendable {
    /// POST /transactions/capture
    func capture(_ r: CaptureRequest) async throws -> CaptureResponse
    /// POST /transactions/:id/receipts
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
