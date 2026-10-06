/**
 * Lógica pura del árbol de categorías.
 *
 * Vive separada del servicio para poder probarla sin base de datos: son reglas
 * de forma (ciclos, profundidad, anidación) que no dependen de Prisma.
 */

/** Lo mínimo que hace falta de una categoría para razonar sobre el árbol. */
export interface CategoryNode {
  id: bigint;
  parentId: bigint | null;
}

/**
 * Profundidad máxima: TRES niveles, que es la forma del modelo.
 *
 *   Centro de costos  →  Categoría  →  Concepto
 *   Costos fijos          Servicios públicos   Celsia (Energía)
 *
 * El movimiento se cuelga del CONCEPTO, que es la hoja. Los dos niveles de
 * arriba no se usan para clasificar: existen para sumar. "¿Cuánto se fue en
 * servicios públicos?" es la suma de sus conceptos, y "¿cuánto en costos
 * fijos?" la de sus categorías.
 *
 * No más de tres: un cuarto nivel obliga a decidir en qué rama va cada cosa
 * antes de poder registrarla, y esa fricción es la que hace que la gente deje
 * de registrar.
 */
export const MAX_DEPTH = 3;

/** Los tres niveles, por su nombre de dominio. `profundidadDe` devuelve 1, 2 o 3. */
export const LEVELS = ['centro de costos', 'categoría', 'concepto'] as const;

/** El nombre del nivel que ocupa una profundidad dada. */
export function levelName(depth: number): string {
  return LEVELS[depth - 1] ?? 'nivel';
}

const key = (id: bigint): string => id.toString();

function indexById<T extends CategoryNode>(categories: readonly T[]): Map<string, T> {
  return new Map(categories.map((category) => [key(category.id), category]));
}

/**
 * ¿Poner `nuevoPadreId` como padre de `id` crearía un ciclo?
 *
 * Sube por la cadena de ancestros del padre propuesto: si en el camino aparece
 * la propia categoría, el árbol se mordería la cola y quedaría un corro de
 * filas inalcanzables desde la raíz. También cuenta el caso trivial de ser su
 * propio padre.
 *
 * El recorrido lleva un conjunto de visitados: si los datos YA estuvieran
 * corruptos con un ciclo, esto termina igual en vez de colgarse.
 */
export function wouldCreateCycle(
  categories: readonly CategoryNode[],
  id: bigint,
  newParentId: bigint | null,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === id) return true;

  const byId = indexById(categories);
  const visited = new Set<string>();

  let actual: bigint | null = newParentId;
  while (actual !== null) {
    if (actual === id) return true;

    const k = key(actual);
    if (visited.has(k)) return true;
    visited.add(k);

    actual = byId.get(k)?.parentId ?? null;
  }

  return false;
}

/** Cuántos niveles hay desde la raíz hasta esta categoría (la raíz es 1). */
export function depthOf(categories: readonly CategoryNode[], id: bigint | null): number {
  if (id === null) return 0;

  const byId = indexById(categories);
  const visited = new Set<string>();

  let depth = 0;
  let actual: bigint | null = id;

  while (actual !== null) {
    const k = key(actual);
    if (visited.has(k)) break;
    visited.add(k);

    depth += 1;
    actual = byId.get(k)?.parentId ?? null;
  }

  return depth;
}

/** Los descendientes de una categoría, en cualquier nivel. */
export function descendantsOf(categories: readonly CategoryNode[], id: bigint): bigint[] {
  const childrenByParent = new Map<string, bigint[]>();
  for (const category of categories) {
    if (category.parentId === null) continue;
    const k = key(category.parentId);
    childrenByParent.set(k, [...(childrenByParent.get(k) ?? []), category.id]);
  }

  const result: bigint[] = [];
  const pending = [...(childrenByParent.get(key(id)) ?? [])];
  const visited = new Set<string>();

  for (let actual = pending.pop(); actual !== undefined; actual = pending.pop()) {
    const k = key(actual);
    if (visited.has(k)) continue;
    visited.add(k);

    result.push(actual);
    pending.push(...(childrenByParent.get(k) ?? []));
  }

  return result;
}

/**
 * Rama del árbol resultante: la profundidad que tendría el subárbol de `id` si
 * colgara de `nuevoPadreId`. Sirve para rechazar movimientos que excederían el
 * límite arrastrando hijos consigo.
 */
export function resultingDepth(
  categories: readonly CategoryNode[],
  id: bigint,
  newParentId: bigint | null,
): number {
  const parentDepth = depthOf(categories, newParentId);

  const byId = indexById(categories);
  const subtreeHeight = descendantsOf(categories, id).reduce((highest, descendant) => {
    // Distancia del descendiente hasta `id`.
    let distance = 0;
    let actual: bigint | null = descendant;
    const visited = new Set<string>();

    while (actual !== null && actual !== id) {
      const k = key(actual);
      if (visited.has(k)) break;
      visited.add(k);
      distance += 1;
      actual = byId.get(k)?.parentId ?? null;
    }

    return Math.max(highest, distance);
  }, 0);

  return parentDepth + 1 + subtreeHeight;
}

/** Categoría con sus hijos anidados, como la espera el cliente. */
export type WithChildren<T> = T & { children: WithChildren<T>[] };

/**
 * Anida una lista plana. Las categorías cuyo padre no está en la lista (porque
 * se filtró por `kind`, por ejemplo) suben a la raíz en vez de desaparecer:
 * perder categorías en silencio sería peor que mostrarlas fuera de su rama.
 */
export function nest<T extends CategoryNode>(categories: readonly T[]): WithChildren<T>[] {
  const nodes = new Map<string, WithChildren<T>>(
    categories.map((category) => [key(category.id), { ...category, children: [] }]),
  );

  const roots: WithChildren<T>[] = [];

  for (const category of categories) {
    const node = nodes.get(key(category.id));
    if (node === undefined) continue; // `nodos` sale de esta misma lista: siempre está
    const parent = category.parentId !== null ? nodes.get(key(category.parentId)) : undefined;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Los ids de un filtro de categorías: `"3,7,12"` → `[3n, 7n, 12n]`.
 *
 * ── Por qué una lista y no un id ────────────────────────────────────────────
 * Porque el panel de filtros son casillas: se pueden marcar varios centros a
 * la vez, o dos categorías de centros distintos. Con un solo id habría que elegir
 * entre "Casa" y "Transporte" cuando la pregunta real suele ser "¿cuánto me
 * cuestan los dos juntos?".
 *
 * Lo que no sea un número se descarta en silencio. Un parámetro mal escrito en
 * una URL pegada no debería impedirle a alguien ver sus movimientos, y el
 * filtro más amplio —sin filtro— nunca esconde datos.
 */
export function categoryIds(raw?: string | number | null): bigint[] {
  if (raw === undefined || raw === null || raw === '') return [];

  const parts = String(raw).split(',');
  const ids: bigint[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!/^\d+$/.test(trimmed)) continue;
    const id = BigInt(trimmed);
    if (!ids.includes(id)) ids.push(id);
  }

  return ids;
}

/**
 * Cada id con toda su rama por debajo, sin repetidos.
 *
 * Los movimientos cuelgan del CONCEPTO, nunca del centro ni dla categoría, así que
 * filtrar por un centro sin expandir su rama devuelve cero filas — que es
 * exactamente lo que pasaba antes de esto.
 */
export function branchesOf(categories: readonly CategoryNode[], ids: readonly bigint[]): bigint[] {
  const branch = new Set<string>();

  for (const id of ids) {
    branch.add(id.toString());
    for (const child of descendantsOf(categories, id)) branch.add(child.toString());
  }

  return [...branch].map((id) => BigInt(id));
}
