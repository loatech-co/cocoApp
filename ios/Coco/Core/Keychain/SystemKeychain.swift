import Foundation
import Security

enum KeychainError: Error, Equatable {
    case system(OSStatus)
    case unreadableValue
}

/// El Keychain de iOS. `kSecClassGenericPassword`, servicio `co.loatech.coco`,
/// cuenta = la clave. `AfterFirstUnlockThisDeviceOnly`: un App Intent puede
/// leerlo con el teléfono bloqueado (tras el primer desbloqueo desde el
/// arranque) y el token nunca viaja en una copia de seguridad ni a otro
/// dispositivo.
struct SystemKeychain: KeychainStore {
    let service: String

    init(service: String = "co.loatech.coco") {
        self.service = service
    }

    func read(_ key: KeychainKey) throws -> String? {
        var query = base(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let state = SecItemCopyMatching(query as CFDictionary, &result)
        switch state {
        case errSecSuccess:
            guard let data = result as? Data, let text = String(data: data, encoding: .utf8) else {
                throw KeychainError.unreadableValue
            }
            return text
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError.system(state)
        }
    }

    func write(_ value: String, at key: KeychainKey) throws {
        let data = Data(value.utf8)
        // Primero actualizar: es el caso corriente (cada renovación rota el
        // refresh). Solo si no existe se añade.
        let changes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let updated = SecItemUpdate(base(key) as CFDictionary, changes as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw KeychainError.system(updated) }
        var newItem = base(key)
        newItem.merge(changes) { _, recent in recent }
        let added = SecItemAdd(newItem as CFDictionary, nil)
        guard added == errSecSuccess else { throw KeychainError.system(added) }
    }

    func delete(_ key: KeychainKey) throws {
        let state = SecItemDelete(base(key) as CFDictionary)
        // Borrar lo que no está no es un error: es el estado que se quería.
        guard state == errSecSuccess || state == errSecItemNotFound else {
            throw KeychainError.system(state)
        }
    }

    private func base(_ key: KeychainKey) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
    }
}

/// El nombre que usa el plan de la fase; el del diseño es `SystemKeychain`.
typealias DeviceKeychain = SystemKeychain
