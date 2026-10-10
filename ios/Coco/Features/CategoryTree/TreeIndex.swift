import Foundation

/// Replica of `packages/receipt-parser/src/search.ts`: the same index, the same
/// scoring and the same order. «mercado» has to find the same thing on the
/// phone as on the web, or the same money ends up in different places depending on
/// where it is captured from.

enum TreeLevel: Sendable {
    case center
    case category
    case concept
}

/// A node of the tree, flattened and ready to compare.
struct IndexEntry: Identifiable, Hashable, Sendable {
    let id: Int
    let level: TreeLevel
    let name: String
    /// What it hangs from, from the nearest to the farthest: concept →
    /// `[category, center]`; category → `[center]`; center → `[]`.
    let path: [String]
    let centerId: Int
    let categoryId: Int?
    /// The center's: in a static one nothing is reclassified from the form.
    let isStatic: Bool
    /// Normalized once, when indexing, and not on every keystroke.
    let normalizedName: String
    let normalizedKeywords: [String]

    var readablePath: String { path.joined(separator: " › ") }
}

struct TreeIndex: Sendable {
    let entries: [IndexEntry]

    /// Flattens the three levels. What is archived does not go in, nor what hangs from it.
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

    /// `category` only for a concept: it is what it hangs from. The path goes from the
    /// nearest to the farthest, and a center hangs from nothing.
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

    /// Empty returns empty: what is shown with the search blank is
    /// decided by the caller. Centers do not come out by default: choosing one
    /// classifies nothing.
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
                // With equal likeness, the concept before the category: it is what
                // classifies all the way.
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

    /// How much an entry resembles what was typed. The order matters more than the
    /// number: exact 4 > starts with 3 > contains 2 > keyword 1. Every
    /// token has to be found: «mercado d1» does not bring everything that says
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

    /// The one from `signatures.ts`: NFD, without diacritics, lowercase, spaces
    /// collapsed and trimmed.
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
