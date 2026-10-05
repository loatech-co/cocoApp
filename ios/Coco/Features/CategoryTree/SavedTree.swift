import Foundation

/// El árbol de categorías tal como se guarda en disco, con cuándo se bajó
/// para saber si está viejo.
struct SavedTree: Codable, Equatable, Sendable {
    let roots: [TreeNode]
    let descargadoEn: Date

    /// Se guarda en disco: las claves no cambian aunque cambie el nombre.
    enum CodingKeys: String, CodingKey {
        case roots = "raices"
        case descargadoEn = "descargadoEn"
    }
}
