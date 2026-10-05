import Foundation

/// El árbol de categorías tal como se guarda en disco, con cuándo se bajó
/// para saber si está viejo.
struct ArbolGuardado: Codable, Equatable, Sendable {
    let raices: [NodoDelArbol]
    let descargadoEn: Date
}
