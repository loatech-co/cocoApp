import Foundation

@testable import Coco

// Dobles de los protocolos de Dominio para la cola, los intents y el puente.
// Con nombres propios («Doble») para no chocar con los que escriben las
// pruebas de la sesión real.

final class SessionDouble: Session, @unchecked Sendable {
    private let lock = NSLock()
    private var _estado: SessionState
    private var _token: String?
    private(set) var renovaciones = 0
    /// Cuántas veces se pidió un token vigente (lo que renueva en fondo).
    private(set) var lecturasDeToken = 0
    private(set) var salidas = 0
    private(set) var descartes = 0
    /// Lo que devuelve `refreshNow()`: nil es éxito.
    var errorAlRenovar: Error?
    let changes: AsyncStream<SessionState>

    static let perfil = PublicProfile(
        id: 7, email: "ana@coco.test", displayName: "Ana", role: "user", status: "active",
        createdAt: "2026-01-01T00:00:00Z")

    init(state: SessionState = .active(SessionDouble.perfil), token: String? = "token-1") {
        _estado = state
        _token = token
        changes = AsyncStream { _ in }
    }

    var state: SessionState { get async { lock.withLock { _estado } } }

    func poner(_ e: SessionState) { lock.withLock { _estado = e } }

    func restore() async {}
    func signIn(email: String, password: String) async throws -> PublicProfile { Self.perfil }

    func validAccessToken() async throws -> String {
        lock.withLock { lecturasDeToken += 1 }
        guard let t = lock.withLock({ _token }) else { throw SessionError.signedOut }
        return t
    }

    func refreshNow() async throws {
        lock.withLock { renovaciones += 1 }
        if let errorAlRenovar { throw errorAlRenovar }
        lock.withLock { _token = "token-\(renovaciones + 1)" }
    }

    func webSession() async throws -> WebSession {
        switch await state {
        case .active(let perfil):
            let token = try await validAccessToken()
            return WebSession(accessToken: token, expiresIn: 3600, userJSON: try JSONEncoder().encode(perfil))
        case .offline:
            throw SessionError.offline
        default:
            throw SessionError.signedOut
        }
    }

    func signOut() async {
        lock.withLock {
            salidas += 1
            _estado = .signedOut
        }
    }
    func discard() async {
        lock.withLock {
            descartes += 1
            _estado = .signedOut
        }
    }
}

final class NotifierDouble: Notifier, @unchecked Sendable {
    private let lock = NSLock()
    private(set) var isRegistered: [SavedResult] = []
    private(set) var fallos: [String] = []
    private(set) var colasEnviadas: [Int] = []
    private(set) var insignias: [Int] = []

    func requestPermission() async -> Bool { true }
    func captureSaved(_ r: SavedResult, source: CaptureSource) async {
        lock.withLock { isRegistered.append(r) }
    }
    func captureFailed(reason: String) async { lock.withLock { fallos.append(reason) } }
    func queueSent(count: Int) async { lock.withLock { colasEnviadas.append(count) } }
    func scheduleExpiry(_ expiresAt: Date, text: String) async {}
    func setBadge(_ n: Int) async { lock.withLock { insignias.append(n) } }
}

/// Un enviador programable: una lista de respuestas por llamada, en orden, y
/// el registro de todo lo que recibió.
final class SenderDouble: CaptureSender, @unchecked Sendable {
    enum Reply {
        case ok
        case falla(Error)
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
    private(set) var subidas: [Upload] = []
    private(set) var instantes: [ContinuousClock.Instant] = []
    var transactionId = 100
    var repetidoSiYaSeVio = true

    init(captures: [Reply] = [], photos: [Reply] = []) {
        self.captures = captures
        self.photos = photos
    }

    func responderCaptura(_ r: Reply) { lock.withLock { captures.append(r) } }
    func responderFoto(_ r: Reply) { lock.withLock { photos.append(r) } }

    var refsUnicos: Set<String> { lock.withLock { Set(requests.map(\.externalRef)) } }

    func capture(_ r: CaptureRequest) async throws -> CaptureResponse {
        let (response, duplicate): (Reply, Bool) = lock.withLock {
            let visto = requests.contains { $0.externalRef == r.externalRef }
            requests.append(r)
            instantes.append(.now)
            return (captures.isEmpty ? .ok : captures.removeFirst(), visto && repetidoSiYaSeVio)
        }
        if case .falla(let e) = response { throw e }
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
            subidas.append(Upload(jpeg: jpeg, name: name, transactionId: transactionId))
            return photos.isEmpty ? .ok : photos.removeFirst()
        }
        if case .falla(let e) = response { throw e }
        return [
            Attachment(
                id: 1, order: 1, fileName: name, mimeType: "image/jpeg", size: jpeg.count, available: true)
        ]
    }
}

final class CapturerDouble: Capturer, @unchecked Sendable {
    private let lock = NSLock()
    private(set) var recibidas: [(body: CaptureBody, source: CaptureSource)] = []
    var response: CaptureResult = .queued(pending: 1)

    func capture(_ body: CaptureBody, source: CaptureSource, photo: Data?, budget: Duration) async
        -> CaptureResult
    {
        lock.withLock { recibidas.append((body, source)) }
        return response
    }
}

final class NavigationDouble: Navigation, @unchecked Sendable {
    private(set) var destinos: [Destination] = []
    @MainActor func go(_ destination: Destination) { destinos.append(destination) }
}

/// Un almacén que falla cuando se le pide: para simular el disco muriendo
/// entre la fase 1 y la 2.
final class FailingStore: QueueStore, @unchecked Sendable {
    let real: DiskQueueStore
    var fallarGuardado = false
    init(real: DiskQueueStore) { self.real = real }

    struct DeadStoreError: Error {}

    func save(_ capture: PendingCapture) throws {
        if fallarGuardado { throw DeadStoreError() }
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
    static func directorio() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appending(
            path: "cola-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}
