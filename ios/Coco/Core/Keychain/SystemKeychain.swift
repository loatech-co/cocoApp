import Foundation
import Security

enum KeychainError: Error, Equatable {
    case system(OSStatus)
    case unreadableValue
}

/// The iOS Keychain. `kSecClassGenericPassword`, service `co.loatech.coco`,
/// account = the key. `AfterFirstUnlockThisDeviceOnly`: an App Intent can
/// read it with the phone locked (after the first unlock since
/// boot) and the token never travels in a backup or to another
/// device.
struct SystemKeychain: KeychainStore {
    let service: String

    static let defaultService = "co.loatech.coco"

    init(service: String = defaultService) {
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

    func write(_ value: String, for key: KeychainKey) throws {
        let data = Data(value.utf8)
        // Update first: it is the usual case (every refresh rotates the
        // refresh token). Only if it does not exist is it added.
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
        // Deleting what is not there is not an error: it is the state that was wanted.
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

/// The name the phase plan uses; the design's is `SystemKeychain`.
typealias DeviceKeychain = SystemKeychain
