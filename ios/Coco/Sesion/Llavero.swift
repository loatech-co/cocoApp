import Foundation

/// Lo único que la app guarda a largo plazo: el refresh token. Una sola
/// clave, nombrada, para que no aparezcan cadenas sueltas por el código.
enum ClaveDelLlavero: String, Sendable {
    case refreshToken = "refresh_token"
}

/// Dónde vive el refresh. El de verdad es el Keychain (`LlaveroDelSistema`);
/// las pruebas usan `LlaveroEnMemoria` para mirar qué se escribió y cuándo.
protocol Llavero: Sendable {
    func leer(_ clave: ClaveDelLlavero) throws -> String?
    /// En el sistema: `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`,
    /// servicio `co.loatech.coco`.
    func escribir(_ valor: String, en clave: ClaveDelLlavero) throws
    func borrar(_ clave: ClaveDelLlavero) throws
}

/// Para las pruebas. Recuerda cada escritura en orden: así una prueba puede
/// comprobar que el refresh nuevo se guardó ANTES de publicar el access.
final class LlaveroEnMemoria: Llavero, @unchecked Sendable {
    private let cerrojo = NSLock()
    private var _valores: [ClaveDelLlavero: String]
    private var _escrituras: [(ClaveDelLlavero, String)] = []
    /// Si se pone, toda operación falla con él: simula un Keychain roto.
    var fallo: Error?

    init(valores: [ClaveDelLlavero: String] = [:]) {
        _valores = valores
    }

    var valores: [ClaveDelLlavero: String] {
        get { cerrojo.withLock { _valores } }
        set { cerrojo.withLock { _valores = newValue } }
    }

    var escrituras: [(ClaveDelLlavero, String)] {
        cerrojo.withLock { _escrituras }
    }

    func leer(_ clave: ClaveDelLlavero) throws -> String? {
        if let fallo { throw fallo }
        return cerrojo.withLock { _valores[clave] }
    }

    func escribir(_ valor: String, en clave: ClaveDelLlavero) throws {
        if let fallo { throw fallo }
        cerrojo.withLock {
            _valores[clave] = valor
            _escrituras.append((clave, valor))
        }
    }

    func borrar(_ clave: ClaveDelLlavero) throws {
        if let fallo { throw fallo }
        cerrojo.withLock { _ = _valores.removeValue(forKey: clave) }
    }
}
