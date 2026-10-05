import Foundation

/// Réplica de `packages/lectura/src/buscar.ts`: el mismo índice, la misma
/// puntuación y el mismo orden. «mercado» tiene que encontrar lo mismo en el
/// teléfono que en la web, o la misma plata acaba en sitios distintos según
/// por dónde se capture.

enum NivelDelArbol: String, Codable, Sendable {
    case centro, categoria, concepto
}

/// Un nodo del árbol, aplanado y listo para comparar.
struct EntradaDelIndice: Identifiable, Hashable, Sendable {
    let id: Int
    let nivel: NivelDelArbol
    let nombre: String
    /// De dónde cuelga, del más cercano al más lejano: concepto →
    /// `[categoría, centro]`; categoría → `[centro]`; centro → `[]`.
    let ruta: [String]
    let centroId: Int
    let categoriaId: Int?
    /// El del centro: en uno estático no se reclasifica desde el formulario.
    let estatico: Bool
    /// Normalizados una vez, al indexar, y no en cada tecla.
    let nombreNormalizado: String
    let palabrasNormalizadas: [String]

    var rutaLegible: String { ruta.joined(separator: " › ") }
}

struct IndiceDelArbol: Sendable {
    let entradas: [EntradaDelIndice]

    /// Aplana los tres niveles. Lo archivado no entra, ni lo que cuelga de ello.
    init(raices: [NodoDelArbol]) {
        var entradas: [EntradaDelIndice] = []
        for centro in raices where !centro.is_archived {
            entradas.append(
                Self.entrada(
                    centro, nivel: .centro, ruta: [], centroId: centro.id, categoriaId: nil, estatico: centro.estatico))
            for categoria in centro.children ?? [] where !categoria.is_archived {
                entradas.append(
                    Self.entrada(
                        categoria, nivel: .categoria, ruta: [centro.name], centroId: centro.id, categoriaId: nil,
                        estatico: centro.estatico))
                for concepto in categoria.children ?? [] where !concepto.is_archived {
                    entradas.append(
                        Self.entrada(
                            concepto, nivel: .concepto, ruta: [categoria.name, centro.name], centroId: centro.id,
                            categoriaId: categoria.id, estatico: centro.estatico))
                }
            }
        }
        self.entradas = entradas
    }

    private static func entrada(
        _ nodo: NodoDelArbol, nivel: NivelDelArbol, ruta: [String], centroId: Int, categoriaId: Int?, estatico: Bool
    ) -> EntradaDelIndice {
        EntradaDelIndice(
            id: nodo.id,
            nivel: nivel,
            nombre: nodo.name,
            ruta: ruta,
            centroId: centroId,
            categoriaId: categoriaId,
            estatico: estatico,
            nombreNormalizado: normalizar(nodo.name),
            palabrasNormalizadas: nodo.palabras_clave.map(normalizar)
        )
    }

    /// Vacío devuelve vacío: lo que se enseña con el buscador en blanco lo
    /// decide quien llama. Los centros no salen por defecto: elegir uno no
    /// clasifica nada.
    func buscar(_ consulta: String, niveles: Set<NivelDelArbol> = [.concepto, .categoria], limite: Int = 20)
        -> [EntradaDelIndice]
    {
        let tokens = Self.normalizar(consulta).split(separator: " ").map(String.init)
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
                let orden = a.0.nombre.compare(b.0.nombre, locale: locale)
                if orden != .orderedSame { return orden == .orderedAscending }
                return a.0.id < b.0.id
            }
            .prefix(limite)
            .map { $0.0 }
    }

    func entrada(id: Int) -> EntradaDelIndice? {
        entradas.first { $0.id == id }
    }

    /// Cuánto se parece una entrada a lo escrito. El orden importa más que el
    /// número: exacto 4 > empieza 3 > contiene 2 > palabra clave 1. Todos los
    /// tokens tienen que hallarse: «mercado d1» no trae todo lo que diga
    /// «mercado».
    private static func puntuar(_ e: EntradaDelIndice, tokens: [String]) -> Int {
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
    static func normalizar(_ s: String) -> String {
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

extension NivelDelArbol {
    fileprivate var peso: Int {
        switch self {
        case .concepto: 2
        case .categoria: 1
        case .centro: 0
        }
    }
}
