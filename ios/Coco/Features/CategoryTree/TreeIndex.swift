import Foundation

/// Réplica de `packages/lectura/src/buscar.ts`: el mismo índice, la misma
/// puntuación y el mismo orden. «mercado» tiene que encontrar lo mismo en el
/// teléfono que en la web, o la misma plata acaba en sitios distintos según
/// por dónde se capture.

enum TreeLevel: Sendable {
    case center
    case category
    case concept
}

/// Un nodo del árbol, aplanado y listo para comparar.
struct IndexEntry: Identifiable, Hashable, Sendable {
    let id: Int
    let level: TreeLevel
    let name: String
    /// De dónde cuelga, del más cercano al más lejano: concepto →
    /// `[categoría, centro]`; categoría → `[centro]`; centro → `[]`.
    let path: [String]
    let centerId: Int
    let categoryId: Int?
    /// El del centro: en uno estático no se reclasifica desde el formulario.
    let isStatic: Bool
    /// Normalizados una vez, al indexar, y no en cada tecla.
    let normalizedName: String
    let normalizedKeywords: [String]

    var readablePath: String { path.joined(separator: " › ") }
}

struct TreeIndex: Sendable {
    let entries: [IndexEntry]

    /// Aplana los tres niveles. Lo archivado no entra, ni lo que cuelga de ello.
    init(roots: [TreeNode]) {
        var entries: [IndexEntry] = []
        for center in roots where !center.isArchived {
            entries.append(Self.makeEntry(center, level: .center, center: center))
            for category in center.children ?? [] where !category.isArchived {
                entries.append(Self.makeEntry(category, level: .category, center: center))
                for concept in category.children ?? [] where !concept.isArchived {
                    entries.append(Self.makeEntry(concept, level: .concept, center: center, category: category))
                }
            }
        }
        self.entries = entries
    }

    /// `categoria` solo para un concepto: es de donde cuelga. El camino va del
    /// más cercano al más lejano, y un centro no cuelga de nada.
    private static func makeEntry(
        _ node: TreeNode, level: TreeLevel, center: TreeNode, category: TreeNode? = nil
    ) -> IndexEntry {
        let path = level == .center ? [] : [category?.name, center.name].compactMap { $0 }
        return IndexEntry(
            id: node.id,
            level: level,
            name: node.name,
            path: path,
            centerId: center.id,
            categoryId: category?.id,
            isStatic: center.isStatic,
            normalizedName: normalize(node.name),
            normalizedKeywords: node.keywords.map(normalize)
        )
    }

    /// Vacío devuelve vacío: lo que se enseña con el buscador en blanco lo
    /// decide quien llama. Los centros no salen por defecto: elegir uno no
    /// clasifica nada.
    func search(_ query: String, levels: Set<TreeLevel> = [.concept, .category], limit: Int = 20)
        -> [IndexEntry]
    {
        let tokens = Self.normalize(query).split(separator: " ").map(String.init)
        if tokens.isEmpty { return [] }
        let locale = Locale(identifier: "es")

        return
            entries
            .filter { levels.contains($0.level) }
            .map { ($0, Self.score($0, tokens: tokens)) }
            .filter { $0.1 > 0 }
            .sorted { a, b in
                if a.1 != b.1 { return a.1 > b.1 }
                // A igual parecido, el concepto antes que la categoría: es lo
                // que clasifica del todo.
                if a.0.level.weight != b.0.level.weight { return a.0.level.weight > b.0.level.weight }
                let order = a.0.name.compare(b.0.name, locale: locale)
                if order != .orderedSame { return order == .orderedAscending }
                return a.0.id < b.0.id
            }
            .prefix(limit)
            .map { $0.0 }
    }

    func entry(id: Int) -> IndexEntry? {
        entries.first { $0.id == id }
    }

    /// Cuánto se parece una entrada a lo escrito. El orden importa más que el
    /// número: exacto 4 > empieza 3 > contiene 2 > palabra clave 1. Todos los
    /// tokens tienen que hallarse: «mercado d1» no trae todo lo que diga
    /// «mercado».
    private static func score(_ e: IndexEntry, tokens: [String]) -> Int {
        var total = 0
        for token in tokens {
            let best: Int
            if e.normalizedName == token {
                best = 4
            } else if e.normalizedName.hasPrefix(token) {
                best = 3
            } else if e.normalizedName.contains(token) {
                best = 2
            } else if e.normalizedKeywords.contains(where: { $0 == token || $0.contains(token) }) {
                best = 1
            } else {
                return 0
            }
            total += best
        }
        return total
    }

    /// La de `firmas.ts`: NFD, sin diacríticos, minúsculas, espacios
    /// colapsados y recortado.
    static func normalize(_ s: String) -> String {
        let withoutAccents = String(
            String.UnicodeScalarView(
                s.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !(0x0300...0x036F).contains($0.value) }
            ))
        return
            withoutAccents
            .lowercased()
            .split(whereSeparator: { $0.isWhitespace || $0.isNewline })
            .joined(separator: " ")
    }
}

extension TreeLevel {
    fileprivate var weight: Int {
        switch self {
        case .concept: 2
        case .category: 1
        case .center: 0
        }
    }
}
