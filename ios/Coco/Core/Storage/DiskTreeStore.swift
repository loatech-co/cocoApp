import Foundation

/// The tree in `Application Support/tree.json`. It is what makes it possible to search for a
/// concept without network: what is saved is good until another one can be downloaded.
struct DiskTreeStore: TreeStore {
    let file: URL

    /// Inside `Application Support`. `StoredFormatTests` pins its name.
    static let fileName = "tree.json"

    /// `Application Support/tree.json` of the app's container. It does not touch the
    /// disk: `save` creates the folder. Never the temporary directory.
    static var atDefaultLocation: DiskTreeStore {
        DiskTreeStore(file: URL.applicationSupportDirectory.appending(path: Self.fileName))
    }

    func load() throws -> SavedTree? {
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        let data = try Data(contentsOf: file)
        return try Self.jsonDecoder.decode(SavedTree.self, from: data)
    }

    func save(_ tree: SavedTree) throws {
        let folder = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        // Atomic: half a file is never left if the app dies while writing.
        try Self.jsonEncoder.encode(tree).write(to: file, options: .atomic)
    }

    private static let jsonEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private static let jsonDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
