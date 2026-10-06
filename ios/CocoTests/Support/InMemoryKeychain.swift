import Foundation
import os

@testable import Coco

/// Para las pruebas. Recuerda cada escritura en orden: así una prueba puede
/// comprobar que el refresh nuevo se guardó ANTES de publicar el access. Vive
/// en las pruebas y no en la app: un doble no se compila dentro de lo que se
/// instala.
final class InMemoryKeychain: KeychainStore {
    private struct State {
        var values: [KeychainKey: String]
        var writes: [(KeychainKey, String)] = []
        /// Si se pone, toda operación falla con él: simula un Keychain roto.
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
