import Foundation

enum QueueError: Error, Equatable {
    /// El tope de fotos en disco está lleno: se admite la captura sin foto o
    /// se espera a que se vacíe la cola, pero no se escribe a ciegas.
    case photosFull
    case notFound(UUID)
    case notEditable(UUID)
}

/// Un JSON por captura en `Application Support/Queue/<uuid>.json` y la foto en
/// `Queue/Photos/<uuid>.jpg`. Escritura atómica: una captura o está entera en
/// disco o no está; nunca a medias.
struct DiskQueueStore: QueueStore {
    let root: URL

    /// Legible tras el primer desbloqueo —un App Intent escribe con el
    /// teléfono bloqueado— y nunca a medias.
    private static let options: Data.WritingOptions = [.atomic, .completeFileProtectionUntilFirstUserAuthentication]

    /// Dentro de `Application Support`. Fija su nombre `StoredFormatTests`.
    static let folderName = "Queue"
    /// Dentro de la carpeta de la cola.
    static let photosFolderName = "Photos"

    init(root: URL) {
        self.root = root
    }

    /// `Application Support/Queue`, creada y excluida de la copia de iCloud: lo
    /// que hay aquí se envía en minutos y restaurarlo en otro teléfono
    /// duplicaría gastos.
    static func defaultRoot(fileManager: FileManager = .default) throws -> URL {
        let supportDirectory = try fileManager.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        var root = supportDirectory.appending(path: folderName, directoryHint: .isDirectory)
        try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try root.setResourceValues(values)
        return root
    }

    private var photos: URL { root.appending(path: Self.photosFolderName, directoryHint: .isDirectory) }

    private func file(_ id: UUID) -> URL {
        root.appending(path: "\(id.uuidString).json")
    }

    // ISO 8601 CON fracción de segundo: la estrategia `.iso8601` de serie la
    // tira, y una captura dejaría de ser igual a sí misma al volver del disco.
    private static let dateFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let jsonEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(dateFormatter.string(from: date))
        }
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    private static let jsonDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            guard let date = dateFormatter.date(from: text) ?? ISO8601DateFormatter().date(from: text) else {
                throw DecodingError.dataCorrupted(
                    .init(codingPath: decoder.codingPath, debugDescription: "Fecha ilegible: \(text)"))
            }
            return date
        }
        return d
    }()

    func save(_ capture: PendingCapture) throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let data = try Self.jsonEncoder.encode(capture)
        try data.write(to: file(capture.id), options: Self.options)
    }

    /// Un archivo que no se deja leer se salta y no tumba la cola entera.
    func all() throws -> [PendingCapture] {
        guard FileManager.default.fileExists(atPath: root.path(percentEncoded: false)) else { return [] }
        let urls = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
        return
            urls
            .filter { $0.pathExtension == "json" }
            .compactMap { url in
                guard let data = try? Data(contentsOf: url) else { return nil }
                return try? Self.jsonDecoder.decode(PendingCapture.self, from: data)
            }
    }

    func delete(id: UUID) throws {
        let url = file(id)
        guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else { return }
        try FileManager.default.removeItem(at: url)
    }

    func savePhoto(_ jpeg: Data, id: UUID) throws -> String {
        try FileManager.default.createDirectory(at: photos, withIntermediateDirectories: true)
        let relativePath = "\(Self.photosFolderName)/\(id.uuidString).jpg"
        try jpeg.write(to: root.appending(path: relativePath), options: Self.options)
        return relativePath
    }

    func photo(at path: String) throws -> Data {
        try Data(contentsOf: root.appending(path: path))
    }

    func deletePhoto(at path: String) throws {
        let url = root.appending(path: path)
        guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else { return }
        try FileManager.default.removeItem(at: url)
    }

    func photoBytes() throws -> Int {
        guard FileManager.default.fileExists(atPath: photos.path(percentEncoded: false)) else { return 0 }
        let urls = try FileManager.default.contentsOfDirectory(at: photos, includingPropertiesForKeys: [.fileSizeKey])
        return urls.reduce(0) { total, url in
            total + ((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
    }
}
