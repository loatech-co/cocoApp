import Foundation
@testable import Coco

// Dobles de los protocolos de Dominio para la cola, los intents y el puente.
// Con nombres propios («Doble») para no chocar con los que escriben las
// pruebas de la sesión real.

final class SesionDoble: Sesion, @unchecked Sendable {
    private let cerrojo = NSLock()
    private var _estado: EstadoDeSesion
    private var _token: String?
    private(set) var renovaciones = 0
    /// Cuántas veces se pidió un token vigente (lo que renueva en fondo).
    private(set) var lecturasDeToken = 0
    private(set) var salidas = 0
    private(set) var descartes = 0
    /// Lo que devuelve `renovarAhora()`: nil es éxito.
    var errorAlRenovar: Error?
    let cambios: AsyncStream<EstadoDeSesion>

    static let perfil = PerfilPublico(id: 7, email: "ana@coco.test", display_name: "Ana", role: "user", status: "active", created_at: "2026-01-01T00:00:00Z")

    init(estado: EstadoDeSesion = .activa(SesionDoble.perfil), token: String? = "token-1") {
        _estado = estado
        _token = token
        cambios = AsyncStream { _ in }
    }

    var estado: EstadoDeSesion { get async { cerrojo.withLock { _estado } } }

    func poner(_ e: EstadoDeSesion) { cerrojo.withLock { _estado = e } }

    func restaurar() async {}
    func entrar(correo: String, contrasena: String) async throws -> PerfilPublico { Self.perfil }

    func accessTokenVigente() async throws -> String {
        cerrojo.withLock { lecturasDeToken += 1 }
        guard let t = cerrojo.withLock({ _token }) else { throw ErrorDeSesion.sinSesion }
        return t
    }

    func renovarAhora() async throws {
        cerrojo.withLock { renovaciones += 1 }
        if let errorAlRenovar { throw errorAlRenovar }
        cerrojo.withLock { _token = "token-\(renovaciones + 1)" }
    }

    func sesionParaLaWeb() async throws -> SesionParaLaWeb {
        switch await estado {
        case .activa(let perfil):
            let token = try await accessTokenVigente()
            return SesionParaLaWeb(accessToken: token, expiresIn: 3600, userJSON: try JSONEncoder().encode(perfil))
        case .sinConexion:
            throw ErrorDeSesion.sinConexion
        default:
            throw ErrorDeSesion.sinSesion
        }
    }

    func salir() async { cerrojo.withLock { salidas += 1; _estado = .sinSesion } }
    func descartar() async { cerrojo.withLock { descartes += 1; _estado = .sinSesion } }
}

final class NotificadorDoble: Notificador, @unchecked Sendable {
    private let cerrojo = NSLock()
    private(set) var registradas: [ResultadoGuardado] = []
    private(set) var fallos: [String] = []
    private(set) var colasEnviadas: [Int] = []
    private(set) var insignias: [Int] = []

    func pedirPermiso() async -> Bool { true }
    func capturaRegistrada(_ r: ResultadoGuardado, origen: OrigenDeCaptura) async { cerrojo.withLock { registradas.append(r) } }
    func capturaFallida(motivo: String) async { cerrojo.withLock { fallos.append(motivo) } }
    func colaEnviada(cuantas: Int) async { cerrojo.withLock { colasEnviadas.append(cuantas) } }
    func programarVencimiento(_ vence: Date, texto: String) async {}
    func ponerInsignia(_ n: Int) async { cerrojo.withLock { insignias.append(n) } }
}

/// Un enviador programable: una lista de respuestas por llamada, en orden, y
/// el registro de todo lo que recibió.
final class EnviadorDoble: EnviadorDeCapturas, @unchecked Sendable {
    enum Respuesta {
        case ok
        case falla(Error)
    }

    private let cerrojo = NSLock()
    private var capturas: [Respuesta]
    private var fotos: [Respuesta]
    private(set) var requests: [CapturaRequest] = []
    private(set) var subidas: [(jpeg: Data, nombre: String, transactionId: Int)] = []
    private(set) var instantes: [ContinuousClock.Instant] = []
    var transactionId = 100
    var repetidoSiYaSeVio = true

    init(capturas: [Respuesta] = [], fotos: [Respuesta] = []) {
        self.capturas = capturas
        self.fotos = fotos
    }

    func responderCaptura(_ r: Respuesta) { cerrojo.withLock { capturas.append(r) } }
    func responderFoto(_ r: Respuesta) { cerrojo.withLock { fotos.append(r) } }

    var refsUnicos: Set<String> { cerrojo.withLock { Set(requests.map(\.external_ref)) } }

    func capturar(_ r: CapturaRequest) async throws -> Captura {
        let (respuesta, repetido): (Respuesta, Bool) = cerrojo.withLock {
            let visto = requests.contains { $0.external_ref == r.external_ref }
            requests.append(r)
            instantes.append(.now)
            return (capturas.isEmpty ? .ok : capturas.removeFirst(), visto && repetidoSiYaSeVio)
        }
        if case .falla(let e) = respuesta { throw e }
        let t = TransaccionResumida(id: transactionId, date: r.cuerpo.fecha ?? "2026-10-05", amount: r.cuerpo.monto ?? "0", category_id: nil, description: r.cuerpo.texto, merchant: r.cuerpo.comercio, source: r.source.rawValue, por_revisar: r.cuerpo.monto == nil)
        let c = ClasificacionPropuesta(certeza: "ninguna", fuente: nil, concepto_id: nil, categoria_id: nil, nombre: nil, candidatos: [], motivo: "")
        return Captura(transaction: t, clasificacion: c, resumen: "Gasto de \(r.cuerpo.monto ?? "0") en \(r.cuerpo.comercio ?? "?")", repetido: repetido, fusionado: false)
    }

    func subirFoto(_ jpeg: Data, nombre: String, a transactionId: Int) async throws -> [Soporte] {
        let respuesta: Respuesta = cerrojo.withLock {
            subidas.append((jpeg, nombre, transactionId))
            return fotos.isEmpty ? .ok : fotos.removeFirst()
        }
        if case .falla(let e) = respuesta { throw e }
        return [Soporte(id: 1, orden: 1, nombre_archivo: nombre, mime_type: "image/jpeg", tamano: jpeg.count, disponible: true)]
    }
}

final class CapturadorDoble: Capturador, @unchecked Sendable {
    private let cerrojo = NSLock()
    private(set) var recibidas: [(cuerpo: CuerpoDeCaptura, origen: OrigenDeCaptura)] = []
    var respuesta: ResultadoDeCaptura = .enCola(pendientes: 1)

    func capturar(_ cuerpo: CuerpoDeCaptura, origen: OrigenDeCaptura, foto: Data?, presupuesto: Duration) async -> ResultadoDeCaptura {
        cerrojo.withLock { recibidas.append((cuerpo, origen)) }
        return respuesta
    }
}

final class NavegacionDoble: Navegacion, @unchecked Sendable {
    private(set) var destinos: [Destino] = []
    @MainActor func ir(_ destino: Destino) { destinos.append(destino) }
}

/// Un almacén que falla cuando se le pide: para simular el disco muriendo
/// entre la fase 1 y la 2.
final class AlmacenQueFalla: AlmacenDeCola, @unchecked Sendable {
    let real: AlmacenDeColaEnDisco
    var fallarGuardado = false
    init(real: AlmacenDeColaEnDisco) { self.real = real }

    struct Muerto: Error {}

    func guardar(_ captura: CapturaPendiente) throws {
        if fallarGuardado { throw Muerto() }
        try real.guardar(captura)
    }
    func todas() throws -> [CapturaPendiente] { try real.todas() }
    func borrar(id: UUID) throws { try real.borrar(id: id) }
    func guardarFoto(_ jpeg: Data, id: UUID) throws -> String { try real.guardarFoto(jpeg, id: id) }
    func foto(en ruta: String) throws -> Data { try real.foto(en: ruta) }
    func borrarFoto(en ruta: String) throws { try real.borrarFoto(en: ruta) }
    func bytesDeFotos() throws -> Int { try real.bytesDeFotos() }
}

enum Temporal {
    static func directorio() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appending(path: "cola-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}
