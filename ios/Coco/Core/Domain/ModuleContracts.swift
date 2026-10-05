import Foundation

// Lo que cruza módulos. Cada módulo compila contra estos protocolos y se
// prueba con dobles, sin esperar a los demás.

// MARK: Sesión

enum SessionState: Equatable, Sendable {
    case cargando
    case sinSesion
    case activa(PublicProfile)
    case sinConexion(ultima: PublicProfile?)
}

/// Lo que el puente entrega a la web: `WebSession` de @coco/types, con el
/// perfil como JSON crudo para no reescribir ni una clave.
struct WebSession: Sendable {
    let accessToken: String
    let expiresIn: Int
    let userJSON: Data

    func comoDiccionario() throws -> [String: Any] {
        let user = try JSONSerialization.jsonObject(with: userJSON)
        return ["access_token": accessToken, "expires_in": expiresIn, "user": user]
    }
}

enum SessionError: Error, Equatable {
    case sinSesion
    case sinConexion
    case origenNoPermitido
}

protocol Session: AnyObject, Sendable {
    var estado: SessionState { get async }
    var cambios: AsyncStream<SessionState> { get }
    func restaurar() async
    func entrar(correo: String, contrasena: String) async throws -> PublicProfile
    /// Renueva si quedan <120 s; una sola renovación en vuelo (single-flight).
    func accessTokenVigente() async throws -> String
    /// Tras un 401 inesperado.
    func renovarAhora() async throws
    func sesionParaLaWeb() async throws -> WebSession
    func salir() async
    func descartar() async
}

// MARK: Red

protocol Transport: Sendable {
    func datos(para peticion: URLRequest) async throws -> (Data, HTTPURLResponse)
}

// MARK: Capturas

struct SavedResult: Codable, Equatable, Sendable {
    let transactionId: Int
    let resumen: String
    let repetido: Bool
    let fusionado: Bool
    let porRevisar: Bool
    let terminadaEn: Date
}

enum CaptureResult: Equatable, Sendable {
    case enviada(SavedResult)
    case enCola(pendientes: Int)
    case fallida(motivo: String)
}

protocol Capturer: Sendable {
    func capturar(_ cuerpo: CaptureBody, origen: CaptureSource, foto: Data?, presupuesto: Duration) async
        -> CaptureResult
}

protocol QueueStore: Sendable {
    func guardar(_ captura: PendingCapture) throws
    func todas() throws -> [PendingCapture]
    func borrar(id: UUID) throws
    func guardarFoto(_ jpeg: Data, id: UUID) throws -> String
    func foto(en ruta: String) throws -> Data
    func borrarFoto(en ruta: String) throws
    func bytesDeFotos() throws -> Int
}

protocol CaptureSender: Sendable {
    /// POST /transactions/capture
    func capturar(_ r: CaptureRequest) async throws -> CaptureResponse
    /// POST /transactions/:id/soportes
    func subirFoto(_ jpeg: Data, nombre: String, a transactionId: Int) async throws -> [Attachment]
}

// MARK: Avisos

protocol Notifier: Sendable {
    func pedirPermiso() async -> Bool
    func capturaRegistrada(_ r: SavedResult, origen: CaptureSource) async
    func capturaFallida(motivo: String) async
    func colaEnviada(cuantas: Int) async
    func programarVencimiento(_ vence: Date, texto: String) async
    func ponerInsignia(_ n: Int) async
}

// MARK: Navegación

enum Destination: Equatable, Sendable {
    case formularioRapido(conCamara: Bool)
    case capturas
    case web(ruta: String)
    case buscar
    case bienvenida
    case ajustes
}

protocol Navigation: AnyObject, Sendable {
    @MainActor func ir(_ destino: Destination)
}

// MARK: Árbol

protocol TreeStore: Sendable {
    func cargar() throws -> SavedTree?
    func guardar(_ a: SavedTree) throws
}
