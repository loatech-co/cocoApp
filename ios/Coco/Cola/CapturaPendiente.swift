import Foundation

/// Una captura en disco, esperando su turno. Es el dato del que hablan los
/// protocolos `AlmacenDeCola` y `EnviadorDeCapturas` (M4 añade la cola).
struct CapturaPendiente: Codable, Identifiable, Equatable, Sendable {
    /// Es también el `external_ref`: la llave de la idempotencia.
    let id: UUID
    /// Es también el `captured_at`.
    let creadaEn: Date
    let origen: OrigenDeCaptura
    var cuerpo: CuerpoDeCaptura
    /// "Fotos/<id>.jpg", relativa a la raíz del almacén.
    var fotoRelativa: String?
    var fase: Fase
    var intentos: Int
    var proximoIntento: Date
    var ultimoError: String?
    /// Lo que contestó la fase 1 cuando aún falta subir la foto: así la
    /// captura termina con el resumen de la API y no con uno inventado.
    var resultadoDeTexto: ResultadoGuardado?

    enum Fase: Codable, Equatable, Sendable {
        case porEnviar
        case porSubirFoto(transactionId: Int)
        case esperandoSesion
        case hecha(ResultadoGuardado)
        case fallida(motivo: String)
    }

    init(
        id: UUID = UUID(), creadaEn: Date = .now, origen: OrigenDeCaptura, cuerpo: CuerpoDeCaptura,
        fotoRelativa: String? = nil, fase: Fase = .porEnviar, intentos: Int = 0, proximoIntento: Date = .distantPast,
        ultimoError: String? = nil, resultadoDeTexto: ResultadoGuardado? = nil
    ) {
        self.id = id
        self.creadaEn = creadaEn
        self.origen = origen
        self.cuerpo = cuerpo
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
        case .hecha, .fallida: false
        }
    }

    /// Lo que se manda a la API; el `captured_at` lleva zona (ISO 8601).
    var request: CapturaRequest {
        CapturaRequest(
            source: origen,
            external_ref: id.uuidString,
            captured_at: creadaEn.formatted(.iso8601),
            cuerpo: cuerpo
        )
    }
}
