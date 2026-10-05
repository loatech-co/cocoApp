import Foundation

/// El árbol en `Application Support/tree.json`. Es lo que permite buscar un
/// concepto sin red: lo guardado vale hasta que se pueda bajar otro.
struct DiskTreeStore: TreeStore {
    let file: URL

    /// Dentro de `Application Support`. Fija su nombre `StoredFormatTests`.
    static let fileName = "tree.json"

    /// `Application Support/tree.json` del contenedor de la app.
    static func atDefaultLocation(fileManager: FileManager = .default) throws -> DiskTreeStore {
        let supportDirectory = try fileManager.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return DiskTreeStore(file: supportDirectory.appending(path: Self.fileName))
    }

    func load() throws -> SavedTree? {
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        let data = try Data(contentsOf: file)
        return try Self.jsonDecoder.decode(SavedTree.self, from: data)
    }

    func save(_ tree: SavedTree) throws {
        let folder = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        // Atómico: nunca queda medio archivo si la app muere escribiendo.
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
