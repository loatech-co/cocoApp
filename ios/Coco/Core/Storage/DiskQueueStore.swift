import Foundation

enum QueueError: Error, Equatable {
    /// The on-disk photo cap is full: the capture is accepted without the photo or
    /// it waits for the queue to empty, but nothing is written blindly.
    case photosFull
    case notFound(UUID)
    case notEditable(UUID)
}

/// One JSON per capture in `Application Support/Queue/<uuid>.json` and the photo in
/// `Queue/Photos/<uuid>.jpg`. Atomic write: a capture is either whole on
/// disk or not there; never half. What cannot be read is set aside in
/// `Queue/Quarantine`, intact, and counted: it is never lost silently.
struct DiskQueueStore: QueueStore {
    let root: URL

    /// Readable after the first unlock —an App Intent writes with the
    /// phone locked— and never half-written.
    private static let options: Data.WritingOptions = [.atomic, .completeFileProtectionUntilFirstUserAuthentication]

    /// Inside `Application Support`. `StoredFormatTests` pins its name.
    static let folderName = "Queue"
    /// Inside the queue folder.
    static let photosFolderName = "Photos"
    /// Inside the queue folder: the files that could not be read.
    static let quarantineFolderName = "Quarantine"

    init(root: URL) {
        self.root = root
    }

    /// `Application Support/Queue`. It does not touch the disk, so it does not fail: the
    /// folder is created —and excluded from the iCloud backup— when writing. Never
    /// the temporary directory, which iOS empties whenever it wants.
    static var defaultRoot: URL {
        URL.applicationSupportDirectory.appending(path: folderName, directoryHint: .isDirectory)
    }

    /// Creates the folder if it is missing and excludes it from the iCloud backup: what is
    /// here is sent within minutes, and restoring it on another phone would duplicate
    /// expenses.
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

    // ISO 8601 WITH fractional seconds: the stock `.iso8601` strategy
    // drops it, and a capture would stop being equal to itself when it comes back from disk.
    // A `FormatStyle` and not an `ISO8601DateFormatter`: it is `Sendable`.
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

    /// What is read and belongs to this version. A corrupt file, or one from a version
    /// this app does not know, is moved to quarantine with its content, and the
    /// queue goes on with the rest. If the DISK cannot be read —the phone has not
    /// been unlocked yet—, it throws: that is not a bad file.
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
