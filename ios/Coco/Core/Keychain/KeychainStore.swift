import Foundation

/// The only thing the app keeps long term: the refresh token. A single
/// key, named, so that no loose strings show up around the code.
enum KeychainKey: String, Sendable {
    case refreshToken = "refresh_token"
}

/// Where the refresh token lives. The real one is the Keychain (`SystemKeychain`);
/// the tests use `InMemoryKeychain` (in `CocoTests`, outside the app) to see what was written and when.
protocol KeychainStore: Sendable {
    func read(_ key: KeychainKey) throws -> String?
    /// In the system: `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`,
    /// service `co.loatech.coco`.
    func write(_ value: String, for key: KeychainKey) throws
    func delete(_ key: KeychainKey) throws
}
