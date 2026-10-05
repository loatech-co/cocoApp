/**
 * Lógica pura del árbol de categorías.
 *
 * Vive separada del servicio para poder probarla sin base de datos: son reglas
 * de forma (ciclos, profundidad, anidación) que no dependen de Prisma.
 */

/** Lo mínimo que hace falta de una categoría para razonar sobre el árbol. */
export interface NodoDeCategoria {
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
export const PROFUNDIDAD_MAXIMA = 3;

/** Los tres niveles, por su nombre de dominio. `profundidadDe` devuelve 1, 2 o 3. */
export const NIVELES = ['centro de costos', 'categoría', 'concepto'] as const;

/** El nombre del nivel que ocupa una profundidad dada. */
export function nombreDelNivel(profundidad: number): string {
  return NIVELES[profundidad - 1] ?? 'nivel';
}

const clave = (id: bigint): string => id.toString();

function indexar<T extends NodoDeCategoria>(categorias: readonly T[]): Map<string, T> {
  return new Map(categorias.map((categoria) => [clave(categoria.id), categoria]));
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
export function generariaCiclo(
  categorias: readonly NodoDeCategoria[],
  id: bigint,
  nuevoPadreId: bigint | null,
): boolean {
  if (nuevoPadreId === null) return false;
  if (nuevoPadreId === id) return true;

  const porId = indexar(categorias);
  const visitados = new Set<string>();

  let actual: bigint | null = nuevoPadreId;
  while (actual !== null) {
    if (actual === id) return true;

    const k = clave(actual);
    if (visitados.has(k)) return true;
    visitados.add(k);

    actual = porId.get(k)?.parentId ?? null;
  }

  return false;
}

/** Cuántos niveles hay desde la raíz hasta esta categoría (la raíz es 1). */
export function profundidadDe(categorias: readonly NodoDeCategoria[], id: bigint | null): number {
  if (id === null) return 0;

  const porId = indexar(categorias);
  const visitados = new Set<string>();

  let profundidad = 0;
  let actual: bigint | null = id;

  while (actual !== null) {
    const k = clave(actual);
    if (visitados.has(k)) break;
    visitados.add(k);

    profundidad += 1;
    actual = porId.get(k)?.parentId ?? null;
  }

  return profundidad;
}

/** Los descendientes de una categoría, en cualquier nivel. */
export function descendientesDe(categorias: readonly NodoDeCategoria[], id: bigint): bigint[] {
  const hijosPorPadre = new Map<string, bigint[]>();
  for (const categoria of categorias) {
    if (categoria.parentId === null) continue;
    const k = clave(categoria.parentId);
    hijosPorPadre.set(k, [...(hijosPorPadre.get(k) ?? []), categoria.id]);
  }

  const resultado: bigint[] = [];
  const pendientes = [...(hijosPorPadre.get(clave(id)) ?? [])];
  const visitados = new Set<string>();

  while (pendientes.length > 0) {
    const actual = pendientes.pop()!;
    const k = clave(actual);
    if (visitados.has(k)) continue;
    visitados.add(k);

    resultado.push(actual);
    pendientes.push(...(hijosPorPadre.get(k) ?? []));
  }

  return resultado;
}

/**
 * Rama del árbol resultante: la profundidad que tendría el subárbol de `id` si
 * colgara de `nuevoPadreId`. Sirve para rechazar movimientos que excederían el
 * límite arrastrando hijos consigo.
 */
export function profundidadResultante(
  categorias: readonly NodoDeCategoria[],
  id: bigint,
  nuevoPadreId: bigint | null,
): number {
  const profundidadDelPadre = profundidadDe(categorias, nuevoPadreId);

  const porId = indexar(categorias);
  const alturaDelSubarbol = descendientesDe(categorias, id).reduce((maxima, descendiente) => {
    // Distancia del descendiente hasta `id`.
    let distancia = 0;
    let actual: bigint | null = descendiente;
    const visitados = new Set<string>();

    while (actual !== null && actual !== id) {
      const k = clave(actual);
      if (visitados.has(k)) break;
      visitados.add(k);
      distancia += 1;
      actual = porId.get(k)?.parentId ?? null;
    }

    return Math.max(maxima, distancia);
  }, 0);

  return profundidadDelPadre + 1 + alturaDelSubarbol;
}

/** Categoría con sus hijos anidados, como la espera el cliente. */
export type ConHijos<T> = T & { children: ConHijos<T>[] };

/**
 * Anida una lista plana. Las categorías cuyo padre no está en la lista (porque
 * se filtró por `kind`, por ejemplo) suben a la raíz en vez de desaparecer:
 * perder categorías en silencio sería peor que mostrarlas fuera de su rama.
 */
export function anidar<T extends NodoDeCategoria>(categorias: readonly T[]): ConHijos<T>[] {
  const nodos = new Map<string, ConHijos<T>>(
    categorias.map((categoria) => [clave(categoria.id), { ...categoria, children: [] }]),
  );

  const raices: ConHijos<T>[] = [];

  for (const categoria of categorias) {
    const nodo = nodos.get(clave(categoria.id))!;
    const padre = categoria.parentId !== null ? nodos.get(clave(categoria.parentId)) : undefined;

    if (padre) {
      padre.children.push(nodo);
    } else {
      raices.push(nodo);
    }
  }

  return raices;
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
export function idsDeCategorias(crudo?: string | number): bigint[] {
  if (crudo === undefined || crudo === null || crudo === '') return [];

  const partes = String(crudo).split(',');
  const ids: bigint[] = [];

  for (const parte of partes) {
    const limpio = parte.trim();
    if (!/^\d+$/.test(limpio)) continue;
    const id = BigInt(limpio);
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
export function ramasDe(categorias: readonly NodoDeCategoria[], ids: readonly bigint[]): bigint[] {
  const rama = new Set<string>();

  for (const id of ids) {
    rama.add(id.toString());
    for (const hijo of descendientesDe(categorias, id)) rama.add(hijo.toString());
  }

  return [...rama].map((id) => BigInt(id));
}
