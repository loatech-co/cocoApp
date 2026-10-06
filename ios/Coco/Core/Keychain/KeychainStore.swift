import Foundation

/// Lo único que la app guarda a largo plazo: el refresh token. Una sola
/// clave, nombrada, para que no aparezcan cadenas sueltas por el código.
enum KeychainKey: String, Sendable {
    case refreshToken = "refresh_token"
}

/// Dónde vive el refresh. El de verdad es el Keychain (`SystemKeychain`);
/// las pruebas usan `InMemoryKeychain` (en `CocoTests`, fuera de la app) para mirar qué se escribió y cuándo.
protocol KeychainStore: Sendable {
    func read(_ key: KeychainKey) throws -> String?
    /// En el sistema: `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`,
    /// servicio `co.loatech.coco`.
    func write(_ value: String, for key: KeychainKey) throws
    func delete(_ key: KeychainKey) throws
}
