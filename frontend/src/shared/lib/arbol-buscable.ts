import type { SearchableNode } from '@coco/receipt-parser';

/** A node of the category tree as the web holds it: the API's shape (v2). */
export interface NodoDelArbol {
  id: number | string;
  name: string;
  keywords?: readonly string[];
  children?: readonly NodoDelArbol[];
}

/**
 * The tree in the shape `@coco/receipt-parser` searches.
 *
 * Only the four fields the search reads, recursively. Both sides say
 * `keywords` (v2 and the package); `keywords` is optional in the package, so
 * a node that lost it would not fail: a concept would just stop being found by
 * its own words without anyone noticing.
 */
export function comoNodosBuscables(arbol: readonly NodoDelArbol[]): SearchableNode[] {
  return arbol.map(({ id, name, keywords, children }) => ({
    id,
    name,
    ...(keywords === undefined ? {} : { keywords }),
    ...(children === undefined ? {} : { children: comoNodosBuscables(children) }),
  }));
}
