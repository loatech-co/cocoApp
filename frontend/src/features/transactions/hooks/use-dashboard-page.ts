import { useState } from 'react';

import { useDashboard, useTransactions } from '@/features/transactions/api/transactions';
import { toApiParams, reachesToday, useFilters } from '@/features/transactions/model/filters';
import type { SortOrder } from '@/features/transactions/model/sort-orders';
import { selectedPath } from '@/features/transactions/model/transactions';
import { useCategories } from '@/shared/api/categories';
import {
  type Category,
  type PendingPayment,
  type Transaction,
  type TransactionType,
} from '@/shared/api/generated/model';

/**
 * Cuántas filas trae cada página de la tabla del resumen.
 *
 * La tabla enseña TODO lo que cae en el recorte, paginado. Enseñar "solo un
 * poco" obliga a saltar a otra pantalla para terminar la pregunta que uno ya
 * estaba haciendo aquí.
 */
export const PAGE_SIZE = 25;

/** La página, el orden y los movimientos de la tabla del resumen. */
function useDashboardTable(filters: ReturnType<typeof useFilters>['filters']) {
  // Los mismos filtros que el resto de la pantalla: si la lista de aquí abajo
  // no respondiera al recorte, contradiría las cifras de arriba.
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState<SortOrder>('-date');
  const transactions = useTransactions({
    ...toApiParams(filters),
    page,
    perPage: PAGE_SIZE,
    sort: order,
  });

  /**
   * Conecta una cabecera con el orden.
   *
   * `primero` es la dirección del PRIMER clic, y no es la misma en todas: en
   * una fecha o un valor uno quiere ver lo más grande y lo más reciente
   * arriba; en un nombre, la A.
   */
  const orderBy = (field: string, first: 'asc' | 'desc') => ({
    direction:
      order === field ? ('asc' as const) : order === `-${field}` ? ('desc' as const) : null,
    onChange: () => {
      setPage(1);
      const descending = `-${field}` as SortOrder;
      const ascending = field as SortOrder;
      if (order === ascending) setOrder(descending);
      else if (order === descending) setOrder(ascending);
      else setOrder(first === 'asc' ? ascending : descending);
    },
  });

  return { page, setPage, transactions, orderBy };
}

/** La ficha del movimiento que se abre desde el resumen, y con qué se abre. */
function useDashboardSheet() {
  // El mismo modal que en Movimientos: editar desde el resumen no puede ser
  // otra pantalla ni otro formulario.
  const [editing, setEditing] = useState<Transaction | null | undefined>(undefined);
  /** El pago pendiente que se está confirmando. Cambia la ficha entera. */
  const [confirming, setConfirming] = useState<PendingPayment | null>(null);
  const [newType, setNewType] = useState<TransactionType>('expense');

  return { editing, setEditing, confirming, setConfirming, newType, setNewType };
}

/** El camino hasta lo que se está desglosando. */
function breakdownPath(tree: Category[], categoryIds: readonly number[]): Category[] {
  // Solo con UNA categoría marcada: con varias no hay un "dentro de" único del
  // que volver.
  if (categoryIds.length !== 1) return [];
  const { costCenter, category, concept } = selectedPath(tree, categoryIds[0]);
  return [costCenter, category, concept].filter((n): n is Category => n !== undefined);
}

/** Todo lo que el resumen lee y recuerda: filtros, cifras, tabla y ficha. */
export function useDashboardPage() {
  const { filters, apply, clear, hasActiveFilters } = useFilters();
  const dashboard = useDashboard(toApiParams(filters));
  const table = useDashboardTable(filters);
  const categories = useCategories();
  const tree = categories.data ?? [];
  const sheet = useDashboardSheet();

  /*
    ── Lo que habla del mes en curso solo aparece si se está mirando el mes ──
    El presupuesto necesario y los pagos pendientes NO son del recorte: son
    siempre del mes de hoy. Puestos al lado de las cifras de agosto de 2024,
    no llegan tarde —responden otra pregunta—, y en un periodo que ya cerró no
    queda nada pendiente, porque ya pasó.

    La prueba es si el recorte llega hasta hoy. Así el mes en curso los
    enseña, y también el año en curso o todo el histórico —que lo contienen—,
    mientras que cualquier periodo cerrado los esconde.
  */
  const isUpToDate = reachesToday(filters);

  /*
    La tarjeta de pendientes solo existe si hay algo pendiente.

    Vacía no dice "todo al día": dice "aquí hay una sección", y ocupa un tercio
    de la fila para decirlo. En un periodo cerrado no puede quedar nada
    pendiente —ya pasó— y en el mes en curso, con todo pagado, la buena noticia
    es que la tarjeta no esté.
  */
  const hasPending = isUpToDate && (dashboard.data?.pending.length ?? 0) > 0;

  const path = breakdownPath(tree, filters.categoryIds);

  return {
    filters,
    apply,
    clear,
    hasActiveFilters,
    dashboard,
    tree,
    isUpToDate,
    hasPending,
    table,
    sheet,
    path,
  };
}
