import Foundation

// Lo que cruza módulos. Cada módulo compila contra estos protocolos y se
// prueba con dobles, sin esperar a los demás.

// MARK: Sesión

enum EstadoDeSesion: Equatable, Sendable {
    case cargando
    case sinSesion
    case activa(PerfilPublico)
    case sinConexion(ultima: PerfilPublico?)
}

/// Lo que el puente entrega a la web: `SesionParaLaWeb` de @coco/types, con el
/// perfil como JSON crudo para no reescribir ni una clave.
struct SesionParaLaWeb: Sendable {
    let accessToken: String
    let expiresIn: Int
    let userJSON: Data

    func comoDiccionario() throws -> [String: Any] {
        let user = try JSONSerialization.jsonObject(with: userJSON)
        return ["access_token": accessToken, "expires_in": expiresIn, "user": user]
    }
}

enum ErrorDeSesion: Error, Equatable {
    case sinSesion
    case sinConexion
    case origenNoPermitido
}

protocol Sesion: AnyObject, Sendable {
    var estado: EstadoDeSesion { get async }
    var cambios: AsyncStream<EstadoDeSesion> { get }
    func restaurar() async
    func entrar(correo: String, contrasena: String) async throws -> PerfilPublico
    /// Renueva si quedan <120 s; una sola renovación en vuelo (single-flight).
    func accessTokenVigente() async throws -> String
    /// Tras un 401 inesperado.
    func renovarAhora() async throws
    func sesionParaLaWeb() async throws -> SesionParaLaWeb
    func salir() async
    func descartar() async
}

// MARK: Red

protocol Transporte: Sendable {
    func datos(para peticion: URLRequest) async throws -> (Data, HTTPURLResponse)
}

// MARK: Capturas

struct ResultadoGuardado: Codable, Equatable, Sendable {
    let transactionId: Int
    let resumen: String
    let repetido: Bool
    let fusionado: Bool
    let porRevisar: Bool
    let terminadaEn: Date
}

enum ResultadoDeCaptura: Equatable, Sendable {
    case enviada(ResultadoGuardado)
    case enCola(pendientes: Int)
    case fallida(motivo: String)
}

protocol Capturador: Sendable {
    func capturar(_ cuerpo: CuerpoDeCaptura, origen: OrigenDeCaptura, foto: Data?, presupuesto: Duration) async -> ResultadoDeCaptura
}

protocol AlmacenDeCola: Sendable {
    func guardar(_ captura: CapturaPendiente) throws
    func todas() throws -> [CapturaPendiente]
    func borrar(id: UUID) throws
    func guardarFoto(_ jpeg: Data, id: UUID) throws -> String
    func foto(en ruta: String) throws -> Data
    func borrarFoto(en ruta: String) throws
    func bytesDeFotos() throws -> Int
}

protocol EnviadorDeCapturas: Sendable {
    /// POST /transactions/capture
    func capturar(_ r: CapturaRequest) async throws -> Captura
    /// POST /transactions/:id/soportes
    func subirFoto(_ jpeg: Data, nombre: String, a transactionId: Int) async throws -> [Soporte]
}

// MARK: Avisos

protocol Notificador: Sendable {
    func pedirPermiso() async -> Bool
    func capturaRegistrada(_ r: ResultadoGuardado, origen: OrigenDeCaptura) async
    func capturaFallida(motivo: String) async
    func colaEnviada(cuantas: Int) async
    func programarVencimiento(_ vence: Date, texto: String) async
    func ponerInsignia(_ n: Int) async
}

// MARK: Navegación

enum Destino: Equatable, Sendable {
    case formularioRapido(conCamara: Bool)
    case capturas
    case web(ruta: String)
    case buscar
    case bienvenida
    case ajustes
}

protocol Navegacion: AnyObject, Sendable {
    @MainActor func ir(_ destino: Destino)
}

// MARK: Árbol

protocol AlmacenDelArbol: Sendable {
    func cargar() throws -> ArbolGuardado?
    func guardar(_ a: ArbolGuardado) throws
}
