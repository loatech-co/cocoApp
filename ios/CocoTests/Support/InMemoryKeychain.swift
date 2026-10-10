import Foundation
import os

@testable import Coco

/// For the tests. It remembers each write in order: that way a test can
/// check that the new refresh token was saved BEFORE the access token was published. It lives
/// in the tests and not in the app: a double is not compiled into what gets
/// installed.
final class InMemoryKeychain: KeychainStore {
    private struct State {
        var values: [KeychainKey: String]
        var writes: [(KeychainKey, String)] = []
        /// If set, every operation fails with it: it simulates a broken Keychain.
        var failure: Error?
    }

    private let state: OSAllocatedUnfairLock<State>

    init(values: [KeychainKey: String] = [:]) {
        state = OSAllocatedUnfairLock(uncheckedState: State(values: values))
    }

    var values: [KeychainKey: String] {
        get { state.withLock { $0.values } }
        set { state.withLock { $0.values = newValue } }
    }

    var writes: [(KeychainKey, String)] {
        state.withLockUnchecked { $0.writes }
    }

    var failure: Error? {
        get { state.withLock { $0.failure } }
        set { state.withLock { $0.failure = newValue } }
    }

    func read(_ key: KeychainKey) throws -> String? {
        try state.withLock { s in
            if let failure = s.failure { throw failure }
            return s.values[key]
        }
    }

    func write(_ value: String, for key: KeychainKey) throws {
        try state.withLock { s in
            if let failure = s.failure { throw failure }
            s.values[key] = value
            s.writes.append((key, value))
        }
    }

    func delete(_ key: KeychainKey) throws {
        try state.withLock { s in
            if let failure = s.failure { throw failure }
            _ = s.values.removeValue(forKey: key)
        }
    }
}
