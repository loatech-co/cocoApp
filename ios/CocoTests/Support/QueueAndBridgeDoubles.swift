import Foundation

@testable import Coco

// Dobles de los protocolos de Dominio para la cola, los intents y el puente.
// Con nombres propios («Doble») para no chocar con los que escriben las
// pruebas de la sesión real.

final class SessionDouble: Session, @unchecked Sendable {
    private let lock = NSLock()
    private var _state: SessionState
    private var _token: String?
    private(set) var refreshes = 0
    /// Cuántas veces se pidió un token vigente (lo que renueva en fondo).
    private(set) var tokenReads = 0
    private(set) var signOuts = 0
    private(set) var discards = 0
    /// Lo que devuelve `refreshNow()`: nil es éxito.
    var refreshError: Error?
    let changes: AsyncStream<SessionState>

    static let profile = PublicProfile(
        id: 7, email: "ana@coco.test", displayName: "Ana", role: "user", status: "active",
        createdAt: "2026-01-01T00:00:00Z")

    init(state: SessionState = .active(SessionDouble.profile), token: String? = "token-1") {
        _state = state
        _token = token
        changes = AsyncStream { _ in }
    }

    var state: SessionState { get async { lock.withLock { _state } } }

    func set(_ e: SessionState) { lock.withLock { _state = e } }

    func restore() async {}
    func signIn(email: String, password: String) async throws -> PublicProfile { Self.profile }

    func validAccessToken() async throws -> String {
        lock.withLock { tokenReads += 1 }
        guard let t = lock.withLock({ _token }) else { throw SessionError.signedOut }
        return t
    }

    func refreshNow() async throws {
        lock.withLock { refreshes += 1 }
        if let refreshError { throw refreshError }
        lock.withLock { _token = "token-\(refreshes + 1)" }
    }

    func webSession() async throws -> WebSession {
        switch await state {
        case .active(let profile):
            let token = try await validAccessToken()
            return WebSession(accessToken: token, expiresIn: 3600, userJSON: try JSONEncoder().encode(profile))
        case .offline:
            throw SessionError.offline
        default:
            throw SessionError.signedOut
        }
    }

    func signOut() async {
        lock.withLock {
            signOuts += 1
            _state = .signedOut
        }
    }
    func discard() async {
        lock.withLock {
            discards += 1
            _state = .signedOut
        }
    }
}

final class NotifierDouble: Notifier, @unchecked Sendable {
    private let lock = NSLock()
    private(set) var isRegistered: [SavedResult] = []
    private(set) var failures: [String] = []
    private(set) var queueSentCounts: [Int] = []
    private(set) var badges: [Int] = []

    func requestPermission() async -> Bool { true }
    func captureSaved(_ r: SavedResult, source: CaptureSource) async {
        lock.withLock { isRegistered.append(r) }
    }
    func captureFailed(reason: String) async { lock.withLock { failures.append(reason) } }
    func queueSent(count: Int) async { lock.withLock { queueSentCounts.append(count) } }
    func scheduleExpiry(_ expiresAt: Date, text: String) async {}
    func setBadge(_ n: Int) async { lock.withLock { badges.append(n) } }
}

/// Un enviador programable: una lista de respuestas por llamada, en orden, y
/// el registro de todo lo que recibió.
final class SenderDouble: CaptureSender, @unchecked Sendable {
    enum Reply {
        case ok
        case failure(Error)
    }

    private let lock = NSLock()
    private var captures: [Reply]
    private var photos: [Reply]
    private(set) var requests: [CaptureRequest] = []
    struct Upload: Equatable {
        let jpeg: Data
        let name: String
        let transactionId: Int
    }
    private(set) var uploads: [Upload] = []
    private(set) var instants: [ContinuousClock.Instant] = []
    var transactionId = 100
    var duplicateIfSeen = true

    init(captures: [Reply] = [], photos: [Reply] = []) {
        self.captures = captures
        self.photos = photos
    }

    func replyToCapture(_ r: Reply) { lock.withLock { captures.append(r) } }
    func replyToPhoto(_ r: Reply) { lock.withLock { photos.append(r) } }

    var uniqueRefs: Set<String> { lock.withLock { Set(requests.map(\.externalRef)) } }

    func capture(_ r: CaptureRequest) async throws -> CaptureResponse {
        let (response, duplicate): (Reply, Bool) = lock.withLock {
            let seen = requests.contains { $0.externalRef == r.externalRef }
            requests.append(r)
            instants.append(.now)
            return (captures.isEmpty ? .ok : captures.removeFirst(), seen && duplicateIfSeen)
        }
        if case .failure(let e) = response { throw e }
        let t = TransactionSummary(
            id: transactionId, date: r.body.date ?? "2026-10-05", amount: r.body.amount ?? "0", categoryId: nil,
            description: r.body.text, merchant: r.body.merchant, source: r.source.rawValue,
            needsReview: r.body.amount == nil)
        let c = ProposedClassification(
            confidence: "ninguna", source: nil, conceptId: nil, categoryId: nil, name: nil, candidates: [],
            reason: "")
        return CaptureResponse(
            transaction: t, classification: c,
            summary: "Gasto de \(r.body.amount ?? "0") en \(r.body.merchant ?? "?")", duplicate: duplicate,
            merged: false)
    }

    func uploadPhoto(_ jpeg: Data, name: String, to transactionId: Int) async throws -> [Attachment] {
        let response: Reply = lock.withLock {
            uploads.append(Upload(jpeg: jpeg, name: name, transactionId: transactionId))
            return photos.isEmpty ? .ok : photos.removeFirst()
        }
        if case .failure(let e) = response { throw e }
        return [
            Attachment(
                id: 1, order: 1, fileName: name, mimeType: "image/jpeg", size: jpeg.count, available: true)
        ]
    }
}

final class CapturerDouble: Capturer, @unchecked Sendable {
    private let lock = NSLock()
    private(set) var received: [(body: CaptureBody, source: CaptureSource)] = []
    var response: CaptureResult = .queued(pending: 1)

    func capture(_ body: CaptureBody, source: CaptureSource, photo: Data?, budget: Duration) async
        -> CaptureResult
    {
        lock.withLock { received.append((body, source)) }
        return response
    }
}

final class NavigationDouble: Navigation, @unchecked Sendable {
    private(set) var destinations: [Destination] = []
    @MainActor func go(_ destination: Destination) { destinations.append(destination) }
}

/// Un almacén que falla cuando se le pide: para simular el disco muriendo
/// entre la fase 1 y la 2.
final class FailingStore: QueueStore, @unchecked Sendable {
    let real: DiskQueueStore
    var failsSave = false
    init(real: DiskQueueStore) { self.real = real }

    struct DeadStoreError: Error {}

    func save(_ capture: PendingCapture) throws {
        if failsSave { throw DeadStoreError() }
        try real.save(capture)
    }
    func all() throws -> [PendingCapture] { try real.all() }
    func delete(id: UUID) throws { try real.delete(id: id) }
    func savePhoto(_ jpeg: Data, id: UUID) throws -> String { try real.savePhoto(jpeg, id: id) }
    func photo(at path: String) throws -> Data { try real.photo(at: path) }
    func deletePhoto(at path: String) throws { try real.deletePhoto(at: path) }
    func photoBytes() throws -> Int { try real.photoBytes() }
}

enum TemporaryDirectory {
    static func directory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appending(
            path: "cola-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}
