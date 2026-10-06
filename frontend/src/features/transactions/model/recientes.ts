import type { IndexEntry } from '@coco/receipt-parser';

/**
 * Los conceptos que alguien usó últimamente, para el buscador en blanco.
 *
 * De los movimientos más recientes —ya vienen ordenados por fecha— se toman
 * los conceptos distintos, en el orden en que aparecen, hasta `maximo`. Solo
 * conceptos: una categoría elegida en un movimiento viejo no es «lo que suelo
 * usar», es un movimiento que se quedó a medio clasificar.
 */
export function conceptosRecientes(
  movimientos: readonly { categoryId: number | null }[] | undefined | null,
  indice: readonly IndexEntry[],
  maximo = 5,
): number[] {
  // Si la respuesta no es una lista —una API vieja, un error envuelto— no hay
  // recientes, y ya. Los recientes son una comodidad: no pueden tumbar la ficha.
  if (!esLista(movimientos)) return [];

  const conceptos = new Set(indice.filter((e) => e.nivel === 'concepto').map((e) => String(e.id)));
  const vistos = new Set<number>();
  const salida: number[] = [];

  for (const m of movimientos) {
    if (m.categoryId === null) continue;
    if (!conceptos.has(String(m.categoryId))) continue;
    if (vistos.has(m.categoryId)) continue;
    vistos.add(m.categoryId);
    salida.push(m.categoryId);
    if (salida.length >= maximo) break;
  }

  return salida;
}

/**
 * `Array.isArray` a secas estrecha un `readonly T[]` a `any[]`, y con eso cada
 * `categoryId` de abajo pasa a ser `any` para el lint. Un predicado propio
 * conserva el tipo.
 */
function esLista(x: unknown): x is readonly { categoryId: number | null }[] {
  return Array.isArray(x);
}
