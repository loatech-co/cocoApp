import Foundation

/// El árbol de categorías tal como se guarda en disco, con cuándo se bajó
/// para saber si está viejo.
struct SavedTree: Codable, Equatable, Sendable {
    let roots: [TreeNode]
    let downloadedAt: Date
    // En disco con las claves sintetizadas; cada nodo lleva las de la API
    // (`TreeNode` es el mismo tipo que llega de `/categories`). Las fija
    // `StoredFormatTests`.
}
