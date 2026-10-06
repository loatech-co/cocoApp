import { normalize } from './signatures';

/**
 * Buscar en el árbol de categorías de una persona.
 *
 * ── Por qué vive aquí y no en el frontend ───────────────────────────────────
 * Porque lo usan dos cosas que no se conocen: el buscador de la ficha de un
 * movimiento, en el navegador, y el diccionario del sistema, que traduce un
 * comercio a términos genéricos y necesita encontrarlos en el árbol de cada
 * cuenta. Escrito dos veces, «mercado» encontraría «Mercado» en un sitio y no
 * en el otro. Y en la fase 3 este motor pasa a la API, que lo hereda tal cual.
 *
 * ── Por qué corre en el navegador y no en el servidor ───────────────────────
 * Un árbol tiene treinta y pico conceptos. Buscar en él es recorrer una lista
 * que ya está descargada; una petición por tecla sería pedirle a la red que
 * haga lo que cabe en un `filter`.
 *
 * ── Qué se busca ────────────────────────────────────────────────────────────
 * Los nombres de los conceptos y de las categorías, y sus palabras clave: si
 * «Mercado» tiene la palabra clave «D1», escribir «d1» lo encuentra. Sin
 * tildes ni mayúsculas, con la misma normalización que todo lo demás.
 */

/** Lo mínimo que un nodo del árbol necesita para poder buscarse. */
export interface SearchableNode {
  id: number | string;
  name: string;
  keywords?: readonly string[];
  children?: readonly SearchableNode[];
}

export type TreeLevel = 'centro' | 'categoria' | 'concepto';

/** Un nodo del árbol, aplanado y listo para comparar. */
export interface IndexEntry {
  id: number | string;
  level: TreeLevel;
  name: string;
  /**
   * De dónde cuelga, del más cercano al más lejano: para un concepto,
   * `[categoría, centro]`; para una categoría, `[centro]`. Es lo que distingue
   * dos «Mercado» en la pantalla.
   */
  path: readonly string[];
  costCenterId: number | string;
  categoryId?: number | string | undefined;
  keywords: readonly string[];
  /** Normalizados una vez, al indexar, y no en cada tecla. */
  normalizedName: string;
  normalizedKeywords: readonly string[];
}

/** Aplana el árbol. Se hace una vez por árbol, no una vez por búsqueda. */
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
 * Cuánto se parece una entrada a lo escrito. Cero es nada.
 *
 * El orden importa más que el número: el nombre exacto gana al que empieza
 * igual, que gana al que lo contiene, que gana a la palabra clave. Escribir
 * «mercado» tiene que poner «Mercado» antes que «Supermercado», y los dos
 * antes que un concepto que tenga «mercado» como palabra clave.
 */
function scoreOf(e: IndexEntry, tokens: readonly string[]): number {
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    if (e.normalizedName === token) best = 4;
    else if (e.normalizedName.startsWith(token)) best = 3;
    else if (e.normalizedName.includes(token)) best = 2;
    else if (e.normalizedKeywords.some((p) => p === token || p.includes(token))) best = 1;
    // Todos los tokens tienen que encontrarse en algún sitio: «mercado d1» no
    // debe traer todo lo que diga «mercado» aunque no sepa nada de «d1».
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

/**
 * Busca lo escrito en el índice. Vacío devuelve vacío: lo que se enseña con
 * el buscador en blanco —los recientes— lo decide quien llama.
 */
export function searchInTree(
  index: readonly IndexEntry[],
  query: string,
  options: { levels?: readonly TreeLevel[]; limit?: number } = {},
): IndexEntry[] {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  // Conceptos y categorías por defecto. Un centro de costos solo no clasifica
  // nada: elegirlo dejaría el movimiento igual de sin clasificar.
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
        // A igual parecido, el concepto antes que la categoría: es lo que
        // clasifica del todo.
        LEVEL_WEIGHT[b.e.level] - LEVEL_WEIGHT[a.e.level] ||
        a.e.name.localeCompare(b.e.name, 'es'),
    )
    .slice(0, options.limit ?? 20)
    .map(({ e }) => e);
}

/** El camino de una entrada tal como se enseña: «Familia › Costos fijos». */
export function readablePath(e: IndexEntry): string {
  return e.path.join(' › ');
}

// ── Resolver términos genéricos: lo que usa el diccionario ───────────────────

export type ClassificationCertainty = 'alta' | 'media' | 'ninguna';

export interface Resolution {
  certainty: ClassificationCertainty;
  /** Solo con certeza alta: el único concepto al que llevan los términos. */
  concept?: IndexEntry | undefined;
  /**
   * Con certeza media: la categoría que se propone, si los términos llevan a
   * una sola. Varios conceptos de categorías distintas no proponen ninguna.
   */
  category?: IndexEntry | undefined;
  /** Con certeza media: entre qué se está dudando, para dejarlo a la vista. */
  candidates: IndexEntry[];
}

/**
 * A dónde llevan unos términos genéricos dentro del árbol de alguien.
 *
 * ── Los tres niveles de certeza ─────────────────────────────────────────────
 * · ALTA: los términos llevan a un solo concepto. Se propone.
 * · MEDIA: llevan a una categoría pero a ningún concepto, o a varios
 *   conceptos. Se propone la categoría —si es una sola— y se dejan los
 *   candidatos a la vista para que la persona elija.
 * · NINGUNA: no llevan a nada. No se propone nada; el buscador queda listo.
 *
 * Nunca se adivina entre varios: «mercado» y «supermercado» pueden ser dos
 * conceptos distintos de la misma cuenta, y elegir uno sería mover plata a un
 * sitio que nadie pidió.
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
