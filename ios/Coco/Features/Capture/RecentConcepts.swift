import Foundation

/// Los últimos conceptos elegidos, para que el buscador vacío ya ofrezca algo:
/// la mayoría de los gastos de una persona caen en cinco o seis conceptos.
enum RecentConcepts {
    static let tope = 5

    /// Puro: el nuevo va primero, sin repetirse, y la lista se corta al tope.
    static func agregar(_ id: Int, a lista: [Int], tope: Int = RecentConcepts.tope) -> [Int] {
        Array(([id] + lista.filter { $0 != id }).prefix(tope))
    }
}

/// Dónde se guardan: UserDefaults. No es dato de negocio —se puede perder sin
/// que pase nada— y así no entra en la cola ni en el llavero.
struct RecentsStore {
    static let clave = "co.loatech.coco.conceptosRecientes"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func leer() -> [Int] {
        defaults.array(forKey: Self.clave) as? [Int] ?? []
    }

    func anotar(_ id: Int) {
        defaults.set(RecentConcepts.agregar(id, a: leer()), forKey: Self.clave)
    }
}
