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
/// disco o no está; nunca a medias. Lo que no se deja leer se aparta a
/// `Queue/Quarantine`, intacto, y se cuenta: nunca se pierde en silencio.
struct DiskQueueStore: QueueStore {
    let root: URL

    /// Legible tras el primer desbloqueo —un App Intent escribe con el
    /// teléfono bloqueado— y nunca a medias.
    private static let options: Data.WritingOptions = [.atomic, .completeFileProtectionUntilFirstUserAuthentication]

    /// Dentro de `Application Support`. Fija su nombre `StoredFormatTests`.
    static let folderName = "Queue"
    /// Dentro de la carpeta de la cola.
    static let photosFolderName = "Photos"
    /// Dentro de la carpeta de la cola: los archivos que no se pudieron leer.
    static let quarantineFolderName = "Quarantine"

    init(root: URL) {
        self.root = root
    }

    /// `Application Support/Queue`. No toca el disco, así que no falla: la
    /// carpeta se crea —y se excluye de la copia de iCloud— al escribir. Nunca
    /// el directorio temporal, que iOS vacía cuando quiere.
    static var defaultRoot: URL {
        URL.applicationSupportDirectory.appending(path: folderName, directoryHint: .isDirectory)
    }

    /// Crea la carpeta si falta y la excluye de la copia de iCloud: lo que hay
    /// aquí se envía en minutos y restaurarlo en otro teléfono duplicaría
    /// gastos.
    private func prepareRoot() throws {
        guard !FileManager.default.fileExists(atPath: root.path(percentEncoded: false)) else { return }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var url = root
        try url.setResourceValues(values)
    }

    private var photos: URL { root.appending(path: Self.photosFolderName, directoryHint: .isDirectory) }
    private var quarantine: URL { root.appending(path: Self.quarantineFolderName, directoryHint: .isDirectory) }

    private func file(_ id: UUID) -> URL {
        root.appending(path: "\(id.uuidString).json")
    }

    // ISO 8601 CON fracción de segundo: la estrategia `.iso8601` de serie la
    // tira, y una captura dejaría de ser igual a sí misma al volver del disco.
    // Un `FormatStyle` y no un `ISO8601DateFormatter`: es `Sendable`.
    private static let dateFormat = Date.ISO8601FormatStyle(includingFractionalSeconds: true)

    private static let jsonEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(dateFormat.format(date))
        }
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    private static let jsonDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            guard let date = (try? dateFormat.parse(text)) ?? (try? Date.ISO8601FormatStyle().parse(text)) else {
                throw DecodingError.dataCorrupted(
                    .init(codingPath: decoder.codingPath, debugDescription: "Fecha ilegible: \(text)"))
            }
            return date
        }
        return d
    }()

    func save(_ capture: PendingCapture) throws {
        try prepareRoot()
        let data = try Self.jsonEncoder.encode(capture)
        try data.write(to: file(capture.id), options: Self.options)
    }

    /// Lo que se lee y es de esta versión. Un archivo corrupto o de una versión
    /// que esta app no conoce se mueve a la cuarentena con su contenido, y la
    /// cola sigue con los demás. Si el DISCO no deja leer —el teléfono aún no
    /// se ha desbloqueado—, lanza: eso no es un archivo malo.
    func all() throws -> [PendingCapture] {
        guard FileManager.default.fileExists(atPath: root.path(percentEncoded: false)) else { return [] }
        let urls = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
        var captures: [PendingCapture] = []
        for url in urls where url.pathExtension == "json" {
            let data = try Data(contentsOf: url)
            if let capture = try? Self.jsonDecoder.decode(PendingCapture.self, from: data),
                capture.version == PendingCapture.formatVersion
            {
                captures.append(capture)
            } else {
                try moveToQuarantine(url)
            }
        }
        return captures
    }

    func quarantined() throws -> Int {
        guard FileManager.default.fileExists(atPath: quarantine.path(percentEncoded: false)) else { return 0 }
        return try FileManager.default.contentsOfDirectory(at: quarantine, includingPropertiesForKeys: nil).count
    }

    private func moveToQuarantine(_ url: URL) throws {
        try FileManager.default.createDirectory(at: quarantine, withIntermediateDirectories: true)
        var target = quarantine.appending(path: url.lastPathComponent)
        if FileManager.default.fileExists(atPath: target.path(percentEncoded: false)) {
            target = quarantine.appending(path: "\(UUID().uuidString)-\(url.lastPathComponent)")
        }
        try FileManager.default.moveItem(at: url, to: target)
        AppLog.queue.error("Captura ilegible apartada a la cuarentena: \(url.lastPathComponent, privacy: .public)")
    }

    func delete(id: UUID) throws {
        let url = file(id)
        guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else { return }
        try FileManager.default.removeItem(at: url)
    }

    func savePhoto(_ jpeg: Data, id: UUID) throws -> String {
        try prepareRoot()
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
