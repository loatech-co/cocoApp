import Foundation

/// Lo único que la app guarda a largo plazo: el refresh token. Una sola
/// clave, nombrada, para que no aparezcan cadenas sueltas por el código.
enum KeychainKey: String, Sendable {
    case refreshToken = "refresh_token"
}

/// Dónde vive el refresh. El de verdad es el Keychain (`SystemKeychain`);
/// las pruebas usan `InMemoryKeychain` para mirar qué se escribió y cuándo.
protocol KeychainStore: Sendable {
    func read(_ key: KeychainKey) throws -> String?
    /// En el sistema: `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`,
    /// servicio `co.loatech.coco`.
    func write(_ value: String, for key: KeychainKey) throws
    func delete(_ key: KeychainKey) throws
}

/// Para las pruebas. Recuerda cada escritura en orden: así una prueba puede
/// comprobar que el refresh nuevo se guardó ANTES de publicar el access.
final class InMemoryKeychain: KeychainStore, @unchecked Sendable {
    private let lock = NSLock()
    private var _values: [KeychainKey: String]
    private var _writes: [(KeychainKey, String)] = []
    /// Si se pone, toda operación falla con él: simula un Keychain roto.
    var failure: Error?

    init(values: [KeychainKey: String] = [:]) {
        _values = values
    }

    var values: [KeychainKey: String] {
        get { lock.withLock { _values } }
        set { lock.withLock { _values = newValue } }
    }

    var writes: [(KeychainKey, String)] {
        lock.withLock { _writes }
    }

    func read(_ key: KeychainKey) throws -> String? {
        if let failure { throw failure }
        return lock.withLock { _values[key] }
    }

    func write(_ value: String, for key: KeychainKey) throws {
        if let failure { throw failure }
        lock.withLock {
            _values[key] = value
            _writes.append((key, value))
        }
    }

    func delete(_ key: KeychainKey) throws {
        if let failure { throw failure }
        lock.withLock { _ = _values.removeValue(forKey: key) }
    }
}
