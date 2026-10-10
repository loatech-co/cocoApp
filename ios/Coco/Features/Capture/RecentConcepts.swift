import Foundation

/// The last chosen concepts, so that the empty search already offers something:
/// most of a person's expenses fall into five or six concepts.
enum RecentConcepts {
    static let limit = 5

    /// Pure: the new one goes first, without repeating, and the list is cut at the cap.
    static func adding(_ id: Int, to list: [Int], limit: Int = RecentConcepts.limit) -> [Int] {
        Array(([id] + list.filter { $0 != id }).prefix(limit))
    }
}

/// Where they are kept: UserDefaults. It is not business data —it can be lost without
/// anything happening— and that way it enters neither the queue nor the keychain.
struct RecentsStore {
    static let key = "co.loatech.coco.recentConcepts"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func read() -> [Int] {
        defaults.array(forKey: Self.key) as? [Int] ?? []
    }

    func record(_ id: Int) {
        defaults.set(RecentConcepts.adding(id, to: read()), forKey: Self.key)
    }
}
