import type { IndexEntry } from '@coco/receipt-parser';

/**
 * Los conceptos que alguien usó últimamente, para el buscador en blanco.
 *
 * De los movimientos más recientes —ya vienen ordenados por fecha— se toman
 * los conceptos distintos, en el orden en que aparecen, hasta `maximo`. Solo
 * conceptos: una categoría elegida en un movimiento viejo no es «lo que suelo
 * usar», es un movimiento que se quedó a medio clasificar.
 */
export function recentConcepts(
  transactions: readonly { categoryId: number | null }[] | undefined | null,
  index: readonly IndexEntry[],
  max = 5,
): number[] {
  // Si la respuesta no es una lista —una API vieja, un error envuelto— no hay
  // recientes, y ya. Los recientes son una comodidad: no pueden tumbar la ficha.
  if (!isList(transactions)) return [];

  const concepts = new Set(index.filter((e) => e.level === 'concepto').map((e) => String(e.id)));
  const seen = new Set<number>();
  const output: number[] = [];

  for (const m of transactions) {
    if (m.categoryId === null) continue;
    if (!concepts.has(String(m.categoryId))) continue;
    if (seen.has(m.categoryId)) continue;
    seen.add(m.categoryId);
    output.push(m.categoryId);
    if (output.length >= max) break;
  }

  return output;
}

/**
 * `Array.isArray` a secas estrecha un `readonly T[]` a `any[]`, y con eso cada
 * `categoryId` de abajo pasa a ser `any` para el lint. Un predicado propio
 * conserva el tipo.
 */
function isList(x: unknown): x is readonly { categoryId: number | null }[] {
  return Array.isArray(x);
}
