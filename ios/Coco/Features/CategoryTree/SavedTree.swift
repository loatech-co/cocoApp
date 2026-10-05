import Foundation

/// El árbol de categorías tal como se guarda en disco, con cuándo se bajó
/// para saber si está viejo.
struct SavedTree: Codable, Equatable, Sendable {
    let raices: [TreeNode]
    let descargadoEn: Date
}
