import Foundation

@testable import Coco

// Dobles de los protocolos de Dominio para la cola, los intents y el puente.
// Con nombres propios («Doble») para no chocar con los que escriben las
// pruebas de la sesión real.

final class SessionDouble: Session, @unchecked Sendable {
    private let cerrojo = NSLock()
    private var _estado: SessionState
    private var _token: String?
    private(set) var renovaciones = 0
    /// Cuántas veces se pidió un token vigente (lo que renueva en fondo).
    private(set) var lecturasDeToken = 0
    private(set) var salidas = 0
    private(set) var descartes = 0
    /// Lo que devuelve `renovarAhora()`: nil es éxito.
    var errorAlRenovar: Error?
    let cambios: AsyncStream<SessionState>

    static let perfil = PublicProfile(
        id: 7, email: "ana@coco.test", displayName: "Ana", role: "user", status: "active",
        createdAt: "2026-01-01T00:00:00Z")

    init(estado: SessionState = .activa(SessionDouble.perfil), token: String? = "token-1") {
        _estado = estado
        _token = token
        cambios = AsyncStream { _ in }
    }

    var estado: SessionState { get async { cerrojo.withLock { _estado } } }

    func poner(_ e: SessionState) { cerrojo.withLock { _estado = e } }

    func restaurar() async {}
    func entrar(correo: String, contrasena: String) async throws -> PublicProfile { Self.perfil }

    func accessTokenVigente() async throws -> String {
        cerrojo.withLock { lecturasDeToken += 1 }
        guard let t = cerrojo.withLock({ _token }) else { throw SessionError.sinSesion }
        return t
    }

    func renovarAhora() async throws {
        cerrojo.withLock { renovaciones += 1 }
        if let errorAlRenovar { throw errorAlRenovar }
        cerrojo.withLock { _token = "token-\(renovaciones + 1)" }
    }

    func sesionParaLaWeb() async throws -> WebSession {
        switch await estado {
        case .activa(let perfil):
            let token = try await accessTokenVigente()
            return WebSession(accessToken: token, expiresIn: 3600, userJSON: try JSONEncoder().encode(perfil))
        case .sinConexion:
            throw SessionError.sinConexion
        default:
            throw SessionError.sinSesion
        }
    }

    func salir() async {
        cerrojo.withLock {
            salidas += 1
            _estado = .sinSesion
        }
    }
    func descartar() async {
        cerrojo.withLock {
            descartes += 1
            _estado = .sinSesion
        }
    }
}

final class NotifierDouble: Notifier, @unchecked Sendable {
    private let cerrojo = NSLock()
    private(set) var registradas: [SavedResult] = []
    private(set) var fallos: [String] = []
    private(set) var colasEnviadas: [Int] = []
    private(set) var insignias: [Int] = []

    func pedirPermiso() async -> Bool { true }
    func capturaRegistrada(_ r: SavedResult, origen: CaptureSource) async {
        cerrojo.withLock { registradas.append(r) }
    }
    func capturaFallida(motivo: String) async { cerrojo.withLock { fallos.append(motivo) } }
    func colaEnviada(cuantas: Int) async { cerrojo.withLock { colasEnviadas.append(cuantas) } }
    func programarVencimiento(_ vence: Date, texto: String) async {}
    func ponerInsignia(_ n: Int) async { cerrojo.withLock { insignias.append(n) } }
}

/// Un enviador programable: una lista de respuestas por llamada, en orden, y
/// el registro de todo lo que recibió.
final class SenderDouble: CaptureSender, @unchecked Sendable {
    enum Reply {
        case ok
        case falla(Error)
    }

    private let cerrojo = NSLock()
    private var capturas: [Reply]
    private var fotos: [Reply]
    private(set) var requests: [CaptureRequest] = []
    struct Upload: Equatable {
        let jpeg: Data
        let nombre: String
        let transactionId: Int
    }
    private(set) var subidas: [Upload] = []
    private(set) var instantes: [ContinuousClock.Instant] = []
    var transactionId = 100
    var repetidoSiYaSeVio = true

    init(capturas: [Reply] = [], fotos: [Reply] = []) {
        self.capturas = capturas
        self.fotos = fotos
    }

    func responderCaptura(_ r: Reply) { cerrojo.withLock { capturas.append(r) } }
    func responderFoto(_ r: Reply) { cerrojo.withLock { fotos.append(r) } }

    var refsUnicos: Set<String> { cerrojo.withLock { Set(requests.map(\.externalRef)) } }

    func capturar(_ r: CaptureRequest) async throws -> CaptureResponse {
        let (respuesta, repetido): (Reply, Bool) = cerrojo.withLock {
            let visto = requests.contains { $0.externalRef == r.externalRef }
            requests.append(r)
            instantes.append(.now)
            return (capturas.isEmpty ? .ok : capturas.removeFirst(), visto && repetidoSiYaSeVio)
        }
        if case .falla(let e) = respuesta { throw e }
        let t = TransactionSummary(
            id: transactionId, date: r.cuerpo.fecha ?? "2026-10-05", amount: r.cuerpo.monto ?? "0", categoryId: nil,
            description: r.cuerpo.texto, merchant: r.cuerpo.comercio, source: r.source.rawValue,
            needsReview: r.cuerpo.monto == nil)
        let c = ProposedClassification(
            certeza: "ninguna", fuente: nil, conceptId: nil, categoryId: nil, nombre: nil, candidatos: [],
            motivo: "")
        return CaptureResponse(
            transaction: t, clasificacion: c,
            resumen: "Gasto de \(r.cuerpo.monto ?? "0") en \(r.cuerpo.comercio ?? "?")", repetido: repetido,
            fusionado: false)
    }

    func subirFoto(_ jpeg: Data, nombre: String, a transactionId: Int) async throws -> [Attachment] {
        let respuesta: Reply = cerrojo.withLock {
            subidas.append(Upload(jpeg: jpeg, nombre: nombre, transactionId: transactionId))
            return fotos.isEmpty ? .ok : fotos.removeFirst()
        }
        if case .falla(let e) = respuesta { throw e }
        return [
            Attachment(
                id: 1, orden: 1, fileName: nombre, mimeType: "image/jpeg", tamano: jpeg.count, disponible: true)
        ]
    }
}

final class CapturerDouble: Capturer, @unchecked Sendable {
    private let cerrojo = NSLock()
    private(set) var recibidas: [(cuerpo: CaptureBody, origen: CaptureSource)] = []
    var respuesta: CaptureResult = .enCola(pendientes: 1)

    func capturar(_ cuerpo: CaptureBody, origen: CaptureSource, foto: Data?, presupuesto: Duration) async
        -> CaptureResult
    {
        cerrojo.withLock { recibidas.append((cuerpo, origen)) }
        return respuesta
    }
}

final class NavigationDouble: Navigation, @unchecked Sendable {
    private(set) var destinos: [Destination] = []
    @MainActor func ir(_ destino: Destination) { destinos.append(destino) }
}

/// Un almacén que falla cuando se le pide: para simular el disco muriendo
/// entre la fase 1 y la 2.
final class FailingStore: QueueStore, @unchecked Sendable {
    let real: DiskQueueStore
    var fallarGuardado = false
    init(real: DiskQueueStore) { self.real = real }

    struct DeadStoreError: Error {}

    func guardar(_ captura: PendingCapture) throws {
        if fallarGuardado { throw DeadStoreError() }
        try real.guardar(captura)
    }
    func todas() throws -> [PendingCapture] { try real.todas() }
    func borrar(id: UUID) throws { try real.borrar(id: id) }
    func guardarFoto(_ jpeg: Data, id: UUID) throws -> String { try real.guardarFoto(jpeg, id: id) }
    func foto(en ruta: String) throws -> Data { try real.foto(en: ruta) }
    func borrarFoto(en ruta: String) throws { try real.borrarFoto(en: ruta) }
    func bytesDeFotos() throws -> Int { try real.bytesDeFotos() }
}

enum TemporaryDirectory {
    static func directorio() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appending(
            path: "cola-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}
