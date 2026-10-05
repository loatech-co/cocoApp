import Foundation

/// Réplica de `packages/lectura/src/buscar.ts`: el mismo índice, la misma
/// puntuación y el mismo orden. «mercado» tiene que encontrar lo mismo en el
/// teléfono que en la web, o la misma plata acaba en sitios distintos según
/// por dónde se capture.

enum TreeLevel: String, Codable, Sendable {
    case centro, categoria, concepto
}

/// Un nodo del árbol, aplanado y listo para comparar.
struct IndexEntry: Identifiable, Hashable, Sendable {
    let id: Int
    let nivel: TreeLevel
    let name: String
    /// De dónde cuelga, del más cercano al más lejano: concepto →
    /// `[categoría, centro]`; categoría → `[centro]`; centro → `[]`.
    let path: [String]
    let centroId: Int
    let categoriaId: Int?
    /// El del centro: en uno estático no se reclasifica desde el formulario.
    let isStatic: Bool
    /// Normalizados una vez, al indexar, y no en cada tecla.
    let nombreNormalizado: String
    let palabrasNormalizadas: [String]

    var rutaLegible: String { path.joined(separator: " › ") }
}

struct TreeIndex: Sendable {
    let entradas: [IndexEntry]

    /// Aplana los tres niveles. Lo archivado no entra, ni lo que cuelga de ello.
    init(raices: [TreeNode]) {
        var entradas: [IndexEntry] = []
        for centro in raices where !centro.isArchived {
            entradas.append(Self.entrada(centro, nivel: .centro, centro: centro))
            for categoria in centro.children ?? [] where !categoria.isArchived {
                entradas.append(Self.entrada(categoria, nivel: .categoria, centro: centro))
                for concepto in categoria.children ?? [] where !concepto.isArchived {
                    entradas.append(Self.entrada(concepto, nivel: .concepto, centro: centro, categoria: categoria))
                }
            }
        }
        self.entradas = entradas
    }

    /// `categoria` solo para un concepto: es de donde cuelga. El camino va del
    /// más cercano al más lejano, y un centro no cuelga de nada.
    private static func entrada(
        _ nodo: TreeNode, nivel: TreeLevel, centro: TreeNode, categoria: TreeNode? = nil
    ) -> IndexEntry {
        let path = nivel == .centro ? [] : [categoria?.name, centro.name].compactMap { $0 }
        return IndexEntry(
            id: nodo.id,
            nivel: nivel,
            name: nodo.name,
            path: path,
            centroId: centro.id,
            categoriaId: categoria?.id,
            isStatic: centro.isStatic,
            nombreNormalizado: normalize(nodo.name),
            palabrasNormalizadas: nodo.keywords.map(normalize)
        )
    }

    /// Vacío devuelve vacío: lo que se enseña con el buscador en blanco lo
    /// decide quien llama. Los centros no salen por defecto: elegir uno no
    /// clasifica nada.
    func search(_ query: String, niveles: Set<TreeLevel> = [.concepto, .categoria], limite: Int = 20)
        -> [IndexEntry]
    {
        let tokens = Self.normalize(query).split(separator: " ").map(String.init)
        if tokens.isEmpty { return [] }
        let locale = Locale(identifier: "es")

        return
            entradas
            .filter { niveles.contains($0.nivel) }
            .map { ($0, Self.puntuar($0, tokens: tokens)) }
            .filter { $0.1 > 0 }
            .sorted { a, b in
                if a.1 != b.1 { return a.1 > b.1 }
                // A igual parecido, el concepto antes que la categoría: es lo
                // que clasifica del todo.
                if a.0.nivel.peso != b.0.nivel.peso { return a.0.nivel.peso > b.0.nivel.peso }
                let order = a.0.name.compare(b.0.name, locale: locale)
                if order != .orderedSame { return order == .orderedAscending }
                return a.0.id < b.0.id
            }
            .prefix(limite)
            .map { $0.0 }
    }

    func entrada(id: Int) -> IndexEntry? {
        entradas.first { $0.id == id }
    }

    /// Cuánto se parece una entrada a lo escrito. El orden importa más que el
    /// número: exacto 4 > empieza 3 > contiene 2 > palabra clave 1. Todos los
    /// tokens tienen que hallarse: «mercado d1» no trae todo lo que diga
    /// «mercado».
    private static func puntuar(_ e: IndexEntry, tokens: [String]) -> Int {
        var total = 0
        for token in tokens {
            let mejor: Int
            if e.nombreNormalizado == token {
                mejor = 4
            } else if e.nombreNormalizado.hasPrefix(token) {
                mejor = 3
            } else if e.nombreNormalizado.contains(token) {
                mejor = 2
            } else if e.palabrasNormalizadas.contains(where: { $0 == token || $0.contains(token) }) {
                mejor = 1
            } else {
                return 0
            }
            total += mejor
        }
        return total
    }

    /// La de `firmas.ts`: NFD, sin diacríticos, minúsculas, espacios
    /// colapsados y recortado.
    static func normalize(_ s: String) -> String {
        let sinTildes = String(
            String.UnicodeScalarView(
                s.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !(0x0300...0x036F).contains($0.value) }
            ))
        return
            sinTildes
            .lowercased()
            .split(whereSeparator: { $0.isWhitespace || $0.isNewline })
            .joined(separator: " ")
    }
}

extension TreeLevel {
    fileprivate var peso: Int {
        switch self {
        case .concepto: 2
        case .categoria: 1
        case .centro: 0
        }
    }
}
