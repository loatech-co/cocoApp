import Foundation

/// El árbol en `Application Support/arbol.json`. Es lo que permite buscar un
/// concepto sin red: lo guardado vale hasta que se pueda bajar otro.
struct DiskTreeStore: TreeStore {
    let archivo: URL

    init(archivo: URL) {
        self.archivo = archivo
    }

    /// `Application Support/arbol.json` del contenedor de la app.
    static func porDefecto(gestor: FileManager = .default) throws -> DiskTreeStore {
        let soporte = try gestor.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return DiskTreeStore(archivo: soporte.appending(path: "arbol.json"))
    }

    func cargar() throws -> SavedTree? {
        guard FileManager.default.fileExists(atPath: archivo.path) else { return nil }
        let datos = try Data(contentsOf: archivo)
        return try Self.decodificador.decode(SavedTree.self, from: datos)
    }

    func guardar(_ a: SavedTree) throws {
        let carpeta = archivo.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
        // Atómico: nunca queda medio archivo si la app muere escribiendo.
        try Self.codificador.encode(a).write(to: archivo, options: .atomic)
    }

    private static let codificador: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private static let decodificador: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
