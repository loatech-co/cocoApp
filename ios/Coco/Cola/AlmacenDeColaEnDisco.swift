import Foundation

enum ErrorDeCola: Error, Equatable {
    /// El tope de fotos en disco está lleno: se admite la captura sin foto o
    /// se espera a que se vacíe la cola, pero no se escribe a ciegas.
    case fotosLlenas
    case noExiste(UUID)
    case noEditable(UUID)
}

/// Un JSON por captura en `Application Support/Cola/<uuid>.json` y la foto en
/// `Cola/Fotos/<uuid>.jpg`. Escritura atómica: una captura o está entera en
/// disco o no está; nunca a medias.
struct AlmacenDeColaEnDisco: AlmacenDeCola {
    let raiz: URL

    /// Legible tras el primer desbloqueo —un App Intent escribe con el
    /// teléfono bloqueado— y nunca a medias.
    private static let opciones: Data.WritingOptions = [.atomic, .completeFileProtectionUntilFirstUserAuthentication]

    init(raiz: URL) {
        self.raiz = raiz
    }

    /// `Application Support/Cola`, creada y excluida de la copia de iCloud: lo
    /// que hay aquí se envía en minutos y restaurarlo en otro teléfono
    /// duplicaría gastos.
    static func raizPorDefecto(fileManager: FileManager = .default) throws -> URL {
        let soporte = try fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        var raiz = soporte.appending(path: "Cola", directoryHint: .isDirectory)
        try fileManager.createDirectory(at: raiz, withIntermediateDirectories: true)
        var valores = URLResourceValues()
        valores.isExcludedFromBackup = true
        try raiz.setResourceValues(valores)
        return raiz
    }

    private var fotos: URL { raiz.appending(path: "Fotos", directoryHint: .isDirectory) }

    private func archivo(_ id: UUID) -> URL {
        raiz.appending(path: "\(id.uuidString).json")
    }

    // ISO 8601 CON fracción de segundo: la estrategia `.iso8601` de serie la
    // tira, y una captura dejaría de ser igual a sí misma al volver del disco.
    private static let formato: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let codificador: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { fecha, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(formato.string(from: fecha))
        }
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    private static let decodificador: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let texto = try decoder.singleValueContainer().decode(String.self)
            guard let fecha = formato.date(from: texto) ?? ISO8601DateFormatter().date(from: texto) else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Fecha ilegible: \(texto)"))
            }
            return fecha
        }
        return d
    }()

    func guardar(_ captura: CapturaPendiente) throws {
        try FileManager.default.createDirectory(at: raiz, withIntermediateDirectories: true)
        let datos = try Self.codificador.encode(captura)
        try datos.write(to: archivo(captura.id), options: Self.opciones)
    }

    /// Un archivo que no se deja leer se salta y no tumba la cola entera.
    func todas() throws -> [CapturaPendiente] {
        guard FileManager.default.fileExists(atPath: raiz.path(percentEncoded: false)) else { return [] }
        let urls = try FileManager.default.contentsOfDirectory(at: raiz, includingPropertiesForKeys: nil)
        return urls
            .filter { $0.pathExtension == "json" }
            .compactMap { url in
                guard let datos = try? Data(contentsOf: url) else { return nil }
                return try? Self.decodificador.decode(CapturaPendiente.self, from: datos)
            }
    }

    func borrar(id: UUID) throws {
        let url = archivo(id)
        guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else { return }
        try FileManager.default.removeItem(at: url)
    }

    func guardarFoto(_ jpeg: Data, id: UUID) throws -> String {
        try FileManager.default.createDirectory(at: fotos, withIntermediateDirectories: true)
        let relativa = "Fotos/\(id.uuidString).jpg"
        try jpeg.write(to: raiz.appending(path: relativa), options: Self.opciones)
        return relativa
    }

    func foto(en ruta: String) throws -> Data {
        try Data(contentsOf: raiz.appending(path: ruta))
    }

    func borrarFoto(en ruta: String) throws {
        let url = raiz.appending(path: ruta)
        guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else { return }
        try FileManager.default.removeItem(at: url)
    }

    func bytesDeFotos() throws -> Int {
        guard FileManager.default.fileExists(atPath: fotos.path(percentEncoded: false)) else { return 0 }
        let urls = try FileManager.default.contentsOfDirectory(at: fotos, includingPropertiesForKeys: [.fileSizeKey])
        return urls.reduce(0) { total, url in
            total + ((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
    }
}
