import Foundation

/// Los últimos conceptos elegidos, para que el buscador vacío ya ofrezca algo:
/// la mayoría de los gastos de una persona caen en cinco o seis conceptos.
enum RecentConcepts {
    static let limit = 5

    /// Puro: el nuevo va primero, sin repetirse, y la lista se corta al tope.
    static func adding(_ id: Int, to list: [Int], limit: Int = RecentConcepts.limit) -> [Int] {
        Array(([id] + list.filter { $0 != id }).prefix(limit))
    }
}

/// Dónde se guardan: UserDefaults. No es dato de negocio —se puede perder sin
/// que pase nada— y así no entra en la cola ni en el llavero.
struct RecentsStore {
    static let key = "co.loatech.coco.conceptosRecientes"
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
