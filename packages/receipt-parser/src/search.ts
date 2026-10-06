import { normalize } from './signatures';

/**
 * Searching a person's category tree.
 *
 * ── Why it lives here and not in the frontend ───────────────────────────────
 * Because two things that do not know each other use it: the search box of
 * a transaction sheet, in the browser, and the system dictionary, which turns
 * a merchant into generic terms and has to find them in each account's tree.
 * Written twice, «mercado» would find «Mercado» in one place and not in the
 * other. And in phase 3 this engine moves to the API, which inherits it as is.
 *
 * ── Why it runs in the browser and not on the server ────────────────────────
 * A tree has thirty-odd concepts. Searching it is walking a list that is
 * already downloaded; a request per keystroke would ask the network to do what
 * fits in a `filter`.
 *
 * ── What is searched ────────────────────────────────────────────────────────
 * The names of concepts and categories, and their keywords: if «Mercado» has
 * the keyword «D1», typing «d1» finds it. Without accents or capitals, with
 * the same normalisation as everything else.
 */

/** The least a tree node needs to be searchable. */
export interface SearchableNode {
  id: number | string;
  name: string;
  keywords?: readonly string[];
  children?: readonly SearchableNode[];
}

export type TreeLevel = 'centro' | 'categoria' | 'concepto';

/** A tree node, flattened and ready to compare. */
export interface IndexEntry {
  id: number | string;
  level: TreeLevel;
  name: string;
  /**
   * What it hangs from, nearest first: for a concept,
   * `[category, cost center]`; for a category, `[cost center]`. It is what
   * tells two «Mercado» apart on screen.
   */
  path: readonly string[];
  costCenterId: number | string;
  categoryId?: number | string | undefined;
  keywords: readonly string[];
  /** Normalised once, when indexing, and not on every keystroke. */
  normalizedName: string;
  normalizedKeywords: readonly string[];
}

/** Flattens the tree. Once per tree, not once per search. */
export function indexTree(roots: readonly SearchableNode[]): IndexEntry[] {
  const entries: IndexEntry[] = [];

  for (const costCenter of roots) {
    entries.push(toEntry(costCenter, 'centro', [], costCenter.id));
    for (const category of costCenter.children ?? []) {
      entries.push(toEntry(category, 'categoria', [costCenter.name], costCenter.id));
      for (const concept of category.children ?? []) {
        entries.push(
          toEntry(
            concept,
            'concepto',
            [category.name, costCenter.name],
            costCenter.id,
            category.id,
          ),
        );
      }
    }
  }

  return entries;
}

function toEntry(
  node: SearchableNode,
  level: TreeLevel,
  path: readonly string[],
  costCenterId: number | string,
  categoryId?: number | string,
): IndexEntry {
  const keywords = node.keywords ?? [];
  return {
    id: node.id,
    level,
    name: node.name,
    path,
    costCenterId,
    categoryId,
    keywords,
    normalizedName: normalize(node.name),
    normalizedKeywords: keywords.map(normalize),
  };
}

/**
 * How close an entry is to what was typed. Zero is nothing.
 *
 * The order matters more than the number: the exact name beats the one that
 * starts the same, which beats the one that contains it, which beats a
 * keyword. Typing «mercado» has to put «Mercado» before «Supermercado», and
 * both before a concept that has «mercado» as a keyword.
 */
function scoreOf(e: IndexEntry, tokens: readonly string[]): number {
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    if (e.normalizedName === token) best = 4;
    else if (e.normalizedName.startsWith(token)) best = 3;
    else if (e.normalizedName.includes(token)) best = 2;
    else if (e.normalizedKeywords.some((p) => p === token || p.includes(token))) best = 1;
    // Every token has to be found somewhere: «mercado d1» must not bring
    // everything that says «mercado» while knowing nothing of «d1».
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

/**
 * Searches the index for what was typed. Empty returns empty: what an empty
 * search box shows —the recent ones— is the caller's decision.
 */
export function searchInTree(
  index: readonly IndexEntry[],
  query: string,
  options: { levels?: readonly TreeLevel[]; limit?: number } = {},
): IndexEntry[] {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  // Concepts and categories by default. A cost center alone classifies
  // nothing: choosing it would leave the transaction just as unclassified.
  const levels = new Set(options.levels ?? ['concepto', 'categoria']);
  const LEVEL_WEIGHT = Object.fromEntries([
    ['concepto', 2],
    ['categoria', 1],
    ['centro', 0],
  ]) as Record<TreeLevel, number>;

  return index
    .filter((e) => levels.has(e.level))
    .map((e) => ({ e, points: scoreOf(e, tokens) }))
    .filter(({ points }) => points > 0)
    .sort(
      (a, b) =>
        b.points - a.points ||
        // On a tie, the concept before the category: it is what classifies
        // all the way.
        LEVEL_WEIGHT[b.e.level] - LEVEL_WEIGHT[a.e.level] ||
        a.e.name.localeCompare(b.e.name, 'es'),
    )
    .slice(0, options.limit ?? 20)
    .map(({ e }) => e);
}

/** An entry's path as it is shown: «Familia › Costos fijos». */
export function readablePath(e: IndexEntry): string {
  return e.path.join(' › ');
}

// ── Resolving generic terms: what the dictionary uses ───────────────────────

export type ClassificationCertainty = 'alta' | 'media' | 'ninguna';

export interface Resolution {
  certainty: ClassificationCertainty;
  /** Only with high certainty: the one concept the terms lead to. */
  concept?: IndexEntry | undefined;
  /**
   * With medium certainty: the proposed category, if the terms lead to just
   * one. Several concepts in different categories propose none.
   */
  category?: IndexEntry | undefined;
  /** With medium certainty: what is in doubt, to keep it in sight. */
  candidates: IndexEntry[];
}

/**
 * Where some generic terms lead inside someone's tree.
 *
 * ── The three certainty levels ──────────────────────────────────────────────
 * · HIGH (`alta`): the terms lead to one concept. It is proposed.
 * · MEDIUM (`media`): they lead to a category but no concept, or to several
 *   concepts. The category is proposed —if there is only one— and the
 *   candidates stay in sight for the person to choose.
 * · NONE (`ninguna`): they lead nowhere. Nothing is proposed; the search box
 *   is ready.
 *
 * It never guesses among several: «mercado» and «supermercado» can be two
 * different concepts of the same account, and choosing one would move money
 * somewhere nobody asked for.
 */
export function resolveTerms(index: readonly IndexEntry[], terms: readonly string[]): Resolution {
  const concepts = new Map<string, IndexEntry>();
  const categories = new Map<string, IndexEntry>();

  for (const term of terms) {
    for (const match of searchInTree(index, term)) {
      const key = String(match.id);
      if (match.level === 'concepto') concepts.set(key, match);
      else if (match.level === 'categoria') categories.set(key, match);
    }
  }

  if (concepts.size === 1) {
    return { certainty: 'alta', concept: [...concepts.values()][0], candidates: [] };
  }

  if (concepts.size > 1) {
    const candidates = [...concepts.values()];
    const candidateCategories = new Set(candidates.map((c) => String(c.categoryId)));
    const category =
      candidateCategories.size === 1
        ? index.find((e) => e.level === 'categoria' && String(e.id) === [...candidateCategories][0])
        : undefined;
    return { certainty: 'media', category, candidates };
  }

  if (categories.size >= 1) {
    const matchedCategories = [...categories.values()];
    return {
      certainty: 'media',
      category: matchedCategories.length === 1 ? matchedCategories[0] : undefined,
      candidates: matchedCategories,
    };
  }

  return { certainty: 'ninguna', candidates: [] };
}
