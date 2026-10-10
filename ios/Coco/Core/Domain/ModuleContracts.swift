import Foundation

// What crosses modules. Each module compiles against these protocols and is
// tested with doubles, without waiting for the others.

// MARK: Session

enum SessionState: Equatable, Sendable {
    case loading
    case signedOut
    case active(PublicProfile)
    case offline(last: PublicProfile?)
}

/// What the bridge hands to the web: `BridgeSession` from
/// `frontend/src/shared/lib/native-contract.ts`, the v2 session without the
/// refresh token. The profile goes as raw JSON: it travels just as it came from the API.
struct WebSession: Sendable {
    let accessToken: String
    let expiresIn: Int
    let userJSON: Data

    func asDictionary() throws -> [String: Any] {
        let user = try JSONSerialization.jsonObject(with: userJSON)
        return ["accessToken": accessToken, "expiresIn": expiresIn, "user": user]
    }
}

enum SessionError: Error, Equatable {
    case signedOut
    case offline
}

protocol Session: AnyObject, Sendable {
    var state: SessionState { get async }
    var changes: AsyncStream<SessionState> { get }
    func restore() async
    func signIn(email: String, password: String) async throws -> PublicProfile
    /// Refreshes if <120 s remain; a single refresh in flight (single-flight).
    func validAccessToken() async throws -> String
    /// After an unexpected 401.
    func refreshNow() async throws
    func webSession() async throws -> WebSession
    func signOut() async
    func discard() async
}

// MARK: Network

protocol Transport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

// MARK: Captures

struct SavedResult: Codable, Equatable, Sendable {
    let transactionId: Int
    let summary: String
    let duplicate: Bool
    let merged: Bool
    let needsReview: Bool
    let finishedAt: Date
    // It is saved on disk inside the queue with the synthesized keys (the
    // property names). `StoredFormatTests` pins them.
}

enum CaptureResult: Equatable, Sendable {
    case sent(SavedResult)
    case queued(pending: Int)
    /// It reached the API, but its response could not be read: it has to be reviewed.
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
    /// How many queue files were set aside because they could not be read.
    func quarantined() throws -> Int
}

protocol CaptureSender: Sendable {
    /// POST /transactions/capture
    func capture(_ r: CaptureRequest) async throws -> CaptureResponse
    /// POST /transactions/:id/receipts
    func uploadPhoto(_ jpeg: Data, name: String, to transactionId: Int) async throws -> [Attachment]
}

// MARK: Notices

protocol Notifier: Sendable {
    func requestPermission() async -> Bool
    func captureSaved(_ r: SavedResult, source: CaptureSource) async
    func captureFailed(reason: String) async
    func queueSent(count: Int) async
    func scheduleExpiry(_ expiresAt: Date, text: String) async
    func setBadge(_ n: Int) async
}

// MARK: Navigation

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

// MARK: Tree

protocol TreeStore: Sendable {
    func load() throws -> SavedTree?
    func save(_ tree: SavedTree) throws
}
