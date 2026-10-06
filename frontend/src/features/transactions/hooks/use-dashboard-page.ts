import { useState } from 'react';

import { useDashboard, useTransactions } from '@/features/transactions/api/transactions';
import { aParametros, llegaHastaHoy, useFiltros } from '@/features/transactions/model/filters';
import type { Orden } from '@/features/transactions/model/sort-orders';
import { rutaSeleccionada } from '@/features/transactions/model/transactions';
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
export const POR_PAGINA = 25;

/** La página, el orden y los movimientos de la tabla del resumen. */
function useDashboardTable(filtros: ReturnType<typeof useFiltros>['filtros']) {
  // Los mismos filtros que el resto de la pantalla: si la lista de aquí abajo
  // no respondiera al recorte, contradiría las cifras de arriba.
  const [pagina, setPagina] = useState(1);
  const [orden, setOrden] = useState<Orden>('-date');
  const movimientos = useTransactions({
    ...aParametros(filtros),
    page: pagina,
    perPage: POR_PAGINA,
    sort: orden,
  });

  /**
   * Conecta una cabecera con el orden.
   *
   * `primero` es la dirección del PRIMER clic, y no es la misma en todas: en
   * una fecha o un valor uno quiere ver lo más grande y lo más reciente
   * arriba; en un nombre, la A.
   */
  const ordenDe = (campo: string, primero: 'asc' | 'desc') => ({
    direction:
      orden === campo ? ('asc' as const) : orden === `-${campo}` ? ('desc' as const) : null,
    onChange: () => {
      setPagina(1);
      const descendente = `-${campo}` as Orden;
      const ascendente = campo as Orden;
      if (orden === ascendente) setOrden(descendente);
      else if (orden === descendente) setOrden(ascendente);
      else setOrden(primero === 'asc' ? ascendente : descendente);
    },
  });

  return { pagina, setPagina, movimientos, ordenDe };
}

/** La ficha del movimiento que se abre desde el resumen, y con qué se abre. */
function useDashboardSheet() {
  // El mismo modal que en Movimientos: editar desde el resumen no puede ser
  // otra pantalla ni otro formulario.
  const [editando, setEditando] = useState<Transaction | null | undefined>(undefined);
  /** El pago pendiente que se está confirmando. Cambia la ficha entera. */
  const [confirmando, setConfirmando] = useState<PendingPayment | null>(null);
  const [tipoNuevo, setTipoNuevo] = useState<TransactionType>('expense');

  return { editando, setEditando, confirmando, setConfirmando, tipoNuevo, setTipoNuevo };
}

/** El camino hasta lo que se está desglosando. */
function rutaDelDesglose(arbol: Category[], categoryIds: readonly number[]): Category[] {
  // Solo con UNA categoría marcada: con varias no hay un "dentro de" único del
  // que volver.
  if (categoryIds.length !== 1) return [];
  const { centro, categoria, concepto } = rutaSeleccionada(arbol, categoryIds[0]);
  return [centro, categoria, concepto].filter((n): n is Category => n !== undefined);
}

/** Todo lo que el resumen lee y recuerda: filtros, cifras, tabla y ficha. */
export function useDashboardPage() {
  const { filtros, aplicar, limpiar, hayFiltrosActivos } = useFiltros();
  const dashboard = useDashboard(aParametros(filtros));
  const tabla = useDashboardTable(filtros);
  const categorias = useCategories();
  const arbol = categorias.data ?? [];
  const ficha = useDashboardSheet();

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
  const alDia = llegaHastaHoy(filtros);

  /*
    La tarjeta de pendientes solo existe si hay algo pendiente.

    Vacía no dice "todo al día": dice "aquí hay una sección", y ocupa un tercio
    de la fila para decirlo. En un periodo cerrado no puede quedar nada
    pendiente —ya pasó— y en el mes en curso, con todo pagado, la buena noticia
    es que la tarjeta no esté.
  */
  const hayPendientes = alDia && (dashboard.data?.pending.length ?? 0) > 0;

  const ruta = rutaDelDesglose(arbol, filtros.categoryIds);

  return {
    filtros,
    aplicar,
    limpiar,
    hayFiltrosActivos,
    dashboard,
    arbol,
    alDia,
    hayPendientes,
    tabla,
    ficha,
    ruta,
  };
}
