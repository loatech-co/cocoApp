import Foundation

/// Una captura en disco, esperando su turno. Es el dato del que hablan los
/// protocolos `QueueStore` y `CaptureSender` (M4 añade la cola).
struct PendingCapture: Codable, Identifiable, Equatable, Sendable {
    /// Es también el `external_ref`: la llave de la idempotencia.
    let id: UUID
    /// Es también el `captured_at`.
    let createdAt: Date
    let source: CaptureSource
    var body: CaptureBody
    /// "Fotos/<id>.jpg", relativa a la raíz del almacén.
    var photoPath: String?
    var phase: Phase
    var attempts: Int
    var nextAttempt: Date
    var lastError: String?
    /// Lo que contestó la fase 1 cuando aún falta subir la foto: así la
    /// captura termina con el resumen de la API y no con uno inventado.
    var textResult: SavedResult?

    enum Phase: Codable, Equatable, Sendable {
        case toSend
        case photoToUpload(transactionId: Int)
        case awaitingSession
        case done(SavedResult)
        case failed(reason: String)
    }

    /// La captura vive en disco: las claves no cambian aunque cambie el nombre
    /// de la propiedad (lo vigila `StoredFormatCompatibilityTests`).
    enum CodingKeys: String, CodingKey {
        case id
        case createdAt = "creadaEn"
        case source = "origen"
        case body = "cuerpo"
        case photoPath = "fotoRelativa"
        case phase = "fase"
        case attempts = "intentos"
        case nextAttempt = "proximoIntento"
        case lastError = "ultimoError"
        case textResult = "resultadoDeTexto"
    }

    init(
        id: UUID = UUID(), createdAt: Date = .now, source: CaptureSource, body: CaptureBody,
        photoPath: String? = nil, phase: Phase = .toSend, attempts: Int = 0, nextAttempt: Date = .distantPast,
        lastError: String? = nil, textResult: SavedResult? = nil
    ) {
        self.id = id
        self.createdAt = createdAt
        self.source = source
        self.body = body
        self.photoPath = photoPath
        self.phase = phase
        self.attempts = attempts
        self.nextAttempt = nextAttempt
        self.lastError = lastError
        self.textResult = textResult
    }

    /// Lo que cuenta como «pendiente»: todo lo que la cola todavía va a mover
    /// por sí sola. Lo fallido espera a una persona y no se cuenta.
    var isPending: Bool {
        switch phase {
        case .toSend, .photoToUpload, .awaitingSession: true
        case .done, .failed: false
        }
    }

    /// Lo que se manda a la API; el `captured_at` lleva zona (ISO 8601).
    var request: CaptureRequest {
        CaptureRequest(
            source: source,
            externalRef: id.uuidString,
            capturedAt: createdAt.formatted(.iso8601),
            body: body
        )
    }
}

/// Las fases viven en disco con sus nombres de siempre. Fuera del tipo para no
/// anidar tres niveles (SwiftLint `nesting`).
extension PendingCapture.Phase {
    enum CodingKeys: String, CodingKey {
        case toSend = "porEnviar"
        case photoToUpload = "porSubirFoto"
        case awaitingSession = "esperandoSesion"
        case done = "hecha"
        case failed = "fallida"
    }

    enum FailedCodingKeys: String, CodingKey {
        case reason = "motivo"
    }
}
