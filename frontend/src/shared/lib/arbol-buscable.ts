import type { NodoBuscable } from '@coco/lectura';

/** A node of the category tree as the web holds it: the API's shape (v2). */
export interface NodoDelArbol {
  id: number | string;
  name: string;
  keywords?: readonly string[];
  children?: readonly NodoDelArbol[];
}

/**
 * The tree in the shape `@coco/lectura` searches.
 *
 * The API says `keywords` (v2); the package, shared with the API's own
 * classifier, still says `palabras_clave`. Without this step the keywords
 * would not fail: they would just be ignored —the field is optional there—
 * and a concept would stop being found by its own words without anyone
 * noticing.
 */
export function comoNodosBuscables(arbol: readonly NodoDelArbol[]): NodoBuscable[] {
  return arbol.map(({ id, name, keywords, children }) => ({
    id,
    name,
    ...(keywords === undefined ? {} : { palabras_clave: keywords }),
    ...(children === undefined ? {} : { children: comoNodosBuscables(children) }),
  }));
}
