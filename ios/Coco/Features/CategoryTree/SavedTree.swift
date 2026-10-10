import Foundation

/// The category tree as it is saved on disk, with when it was downloaded
/// to know whether it is stale.
struct SavedTree: Codable, Equatable, Sendable {
    let roots: [TreeNode]
    let downloadedAt: Date
    // On disk with the synthesized keys; each node carries the API's
    // (`TreeNode` is the same type that arrives from `/categories`).
    // `StoredFormatTests` pins them.
}
