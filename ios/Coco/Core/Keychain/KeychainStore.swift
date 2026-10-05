import Foundation

/// Lo único que la app guarda a largo plazo: el refresh token. Una sola
/// clave, nombrada, para que no aparezcan cadenas sueltas por el código.
enum KeychainKey: String, Sendable {
    case refreshToken = "refresh_token"
}

/// Dónde vive el refresh. El de verdad es el Keychain (`SystemKeychain`);
/// las pruebas usan `InMemoryKeychain` para mirar qué se escribió y cuándo.
protocol KeychainStore: Sendable {
    func leer(_ clave: KeychainKey) throws -> String?
    /// En el sistema: `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`,
    /// servicio `co.loatech.coco`.
    func escribir(_ valor: String, en clave: KeychainKey) throws
    func borrar(_ clave: KeychainKey) throws
}

/// Para las pruebas. Recuerda cada escritura en orden: así una prueba puede
/// comprobar que el refresh nuevo se guardó ANTES de publicar el access.
final class InMemoryKeychain: KeychainStore, @unchecked Sendable {
    private let cerrojo = NSLock()
    private var _valores: [KeychainKey: String]
    private var _escrituras: [(KeychainKey, String)] = []
    /// Si se pone, toda operación falla con él: simula un Keychain roto.
    var fallo: Error?

    init(valores: [KeychainKey: String] = [:]) {
        _valores = valores
    }

    var valores: [KeychainKey: String] {
        get { cerrojo.withLock { _valores } }
        set { cerrojo.withLock { _valores = newValue } }
    }

    var escrituras: [(KeychainKey, String)] {
        cerrojo.withLock { _escrituras }
    }

    func leer(_ clave: KeychainKey) throws -> String? {
        if let fallo { throw fallo }
        return cerrojo.withLock { _valores[clave] }
    }

    func escribir(_ valor: String, en clave: KeychainKey) throws {
        if let fallo { throw fallo }
        cerrojo.withLock {
            _valores[clave] = valor
            _escrituras.append((clave, valor))
        }
    }

    func borrar(_ clave: KeychainKey) throws {
        if let fallo { throw fallo }
        cerrojo.withLock { _ = _valores.removeValue(forKey: clave) }
    }
}
