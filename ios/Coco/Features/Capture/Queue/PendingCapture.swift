import Foundation

/// Una captura en disco, esperando su turno. Es el dato del que hablan los
/// protocolos `QueueStore` y `CaptureSender` (M4 añade la cola).
struct PendingCapture: Codable, Identifiable, Equatable, Sendable {
    /// Es también el `external_ref`: la llave de la idempotencia.
    let id: UUID
    /// Es también el `captured_at`.
    let creadaEn: Date
    let source: CaptureSource
    var body: CaptureBody
    /// "Fotos/<id>.jpg", relativa a la raíz del almacén.
    var fotoRelativa: String?
    var fase: Phase
    var intentos: Int
    var proximoIntento: Date
    var ultimoError: String?
    /// Lo que contestó la fase 1 cuando aún falta subir la foto: así la
    /// captura termina con el resumen de la API y no con uno inventado.
    var resultadoDeTexto: SavedResult?

    enum Phase: Codable, Equatable, Sendable {
        case porEnviar
        case porSubirFoto(transactionId: Int)
        case esperandoSesion
        case hecha(SavedResult)
        case failed(reason: String)
    }

    /// La captura vive en disco: las claves no cambian aunque cambie el nombre
    /// de la propiedad (lo vigila `StoredFormatCompatibilityTests`).
    enum CodingKeys: String, CodingKey {
        case id
        case creadaEn = "creadaEn"
        case source = "origen"
        case body = "cuerpo"
        case fotoRelativa = "fotoRelativa"
        case fase = "fase"
        case intentos = "intentos"
        case proximoIntento = "proximoIntento"
        case ultimoError = "ultimoError"
        case resultadoDeTexto = "resultadoDeTexto"
    }

    init(
        id: UUID = UUID(), creadaEn: Date = .now, source: CaptureSource, body: CaptureBody,
        fotoRelativa: String? = nil, fase: Phase = .porEnviar, intentos: Int = 0, proximoIntento: Date = .distantPast,
        ultimoError: String? = nil, resultadoDeTexto: SavedResult? = nil
    ) {
        self.id = id
        self.creadaEn = creadaEn
        self.source = source
        self.body = body
        self.fotoRelativa = fotoRelativa
        self.fase = fase
        self.intentos = intentos
        self.proximoIntento = proximoIntento
        self.ultimoError = ultimoError
        self.resultadoDeTexto = resultadoDeTexto
    }

    /// Lo que cuenta como «pendiente»: todo lo que la cola todavía va a mover
    /// por sí sola. Lo fallido espera a una persona y no se cuenta.
    var estaPendiente: Bool {
        switch fase {
        case .porEnviar, .porSubirFoto, .esperandoSesion: true
        case .hecha, .failed: false
        }
    }

    /// Lo que se manda a la API; el `captured_at` lleva zona (ISO 8601).
    var request: CaptureRequest {
        CaptureRequest(
            source: source,
            externalRef: id.uuidString,
            capturedAt: creadaEn.formatted(.iso8601),
            body: body
        )
    }
}

/// Las fases viven en disco con sus nombres de siempre. Fuera del tipo para no
/// anidar tres niveles (SwiftLint `nesting`).
extension PendingCapture.Phase {
    enum CodingKeys: String, CodingKey {
        case porEnviar = "porEnviar"
        case porSubirFoto = "porSubirFoto"
        case esperandoSesion = "esperandoSesion"
        case hecha = "hecha"
        case failed = "fallida"
    }

    enum FailedCodingKeys: String, CodingKey {
        case reason = "motivo"
    }
}
