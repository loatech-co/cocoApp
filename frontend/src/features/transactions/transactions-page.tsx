import { AlertCircle, Plus, SearchX } from 'lucide-react';
import { useState } from 'react';

import { EstadoVacio } from '@/components/estado-vacio';
import { Paginador } from '@/components/paginador';
import { TablaDeMovimientos } from '@/components/tabla-de-movimientos';
import { TablaPie, Td } from '@/components/tabla';
import { ToolbarFiltros, type Orden } from '@/components/toolbar-filtros';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { MovimientoModal } from '@/features/transactions/movimiento-modal';
import { ApiClientError } from '@/lib/api-client';
import { aParametros, useFiltros } from '@/lib/filtros';
import { useCategories, useTransactions } from '@/lib/queries';
import { formatCOP } from '@/lib/utils';
import type { Transaction } from '@coco/types';

const POR_PAGINA = 50;

/**
 * Movimientos.
 *
 * ── Dos formas de editar, a propósito ───────────────────────────────────────
 * Reclasificar es lo que más se hace después de una importación, y hacerlo de
 * a uno abriendo un modal cada vez es insoportable con cientos de filas. Por
 * eso el centro y el grupo se cambian EN LA FILA, sin abrir nada.
 *
 * Todo lo demás —concepto, valor, fecha, notas— vive en el modal, que es el
 * mismo que se usa para crear.
 */
export function TransactionsPage() {
  // 'todo' por defecto: la lista es el archivo completo. Recortarla sola al mes
  // en curso escondería movimientos sin que nadie lo haya pedido. El resumen sí
  // arranca acotado, porque ahí la pregunta es "¿cómo voy este mes?".
  const { filtros, aplicar, limpiar, hayFiltrosActivos } = useFiltros('todo');
  const [pagina, setPagina] = useState(1);
  const [orden, setOrden] = useState<Orden>('-date');
  const [editando, setEditando] = useState<Transaction | null | undefined>(undefined);

  const movimientos = useTransactions({
    ...aParametros(filtros),
    page: pagina,
    per_page: POR_PAGINA,
    sort: orden,
  });

  const categorias = useCategories();
  const arbol = categorias.data ?? [];

  const total = movimientos.data?.meta?.total ?? 0;

  /**
   * Conecta una cabecera con el orden.
   *
   * `primero` es la dirección del PRIMER clic, y no es la misma en todas: en
   * una fecha o un valor uno quiere ver lo más grande y lo más reciente
   * arriba; en un nombre, la A.
   */
  const ordenDe = (campo: string, primero: 'asc' | 'desc') => ({
    activo: orden === campo ? ('asc' as const) : orden === `-${campo}` ? ('desc' as const) : null,
    onCambiar: () => {
      setPagina(1);
      const descendente = `-${campo}` as Orden;
      const ascendente = campo as Orden;
      if (orden === ascendente) setOrden(descendente);
      else if (orden === descendente) setOrden(ascendente);
      else setOrden(primero === 'asc' ? ascendente : descendente);
    },
  });

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <ToolbarFiltros
        titulo="Movimientos"
        subtitulo={
          total > 0
            ? `Viendo ${Math.min(POR_PAGINA, total - (pagina - 1) * POR_PAGINA)} de ${total} movimientos`
            : 'Toca una fila para editarla completa.'
        }
        filtros={filtros}
        aplicar={(c) => {
          setPagina(1);
          aplicar(c);
        }}
        limpiar={() => {
          setPagina(1);
          limpiar();
        }}
        hayFiltrosActivos={hayFiltrosActivos}
        orden={{
          valor: orden,
          onCambiar: (o) => {
            setPagina(1);
            setOrden(o);
          },
        }}
        acciones={
          <Button type="button" size="chip" onClick={() => setEditando(null)}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo
          </Button>
        }
      />

      {movimientos.isError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>No se pudieron cargar los movimientos</AlertTitle>
          <AlertDescription>
            {movimientos.error instanceof ApiClientError
              ? movimientos.error.message
              : 'Revisa que la API esté corriendo.'}
          </AlertDescription>
        </Alert>
      )}

      <TablaDeMovimientos
        movimientos={movimientos.data?.data ?? []}
        arbol={arbol}
        cargando={movimientos.isPending}
        onAbrir={setEditando}
        orden={ordenDe}
        filasDelEsqueleto={8}
        vacio={
          <EstadoVacio
            Icono={SearchX}
            titulo={hayFiltrosActivos ? 'Ningún movimiento coincide' : 'Todavía no hay movimientos'}
            ayuda={
              hayFiltrosActivos
                ? 'Los filtros están dejando todo fuera. Quítalos para ver la lista completa.'
                : 'Registra el primero o importa un extracto para empezar.'
            }
            accion={
              hayFiltrosActivos ? (
                <Button type="button" variant="outline" onClick={limpiar}>
                  Quitar los filtros
                </Button>
              ) : (
                <Button type="button" onClick={() => setEditando(null)}>
                  <Plus className="size-4" aria-hidden="true" />
                  Nuevo movimiento
                </Button>
              )
            }
          />
        }
        pie={
          movimientos.data && movimientos.data.data.length > 0 ? (
            <TablaPie>
              <tr className="border-b border-border">
                <Td fija className="text-muted-foreground">
                  Promedio
                </Td>
                <Td />
                <Td />
                <Td />
                <Td />
                <Td alineado="derecha" className="tabular">
                  {formatCOP(Number(movimientos.data.meta.sum_expense ?? 0) / Math.max(1, total))}
                </Td>
              </tr>
              <tr>
                <Td fija>Total · {total} movimientos</Td>
                <Td />
                <Td />
                <Td />
                <Td />
                <Td alineado="derecha" className="tabular font-semibold text-expense">
                  {formatCOP(movimientos.data.meta.sum_expense ?? '0')}
                </Td>
              </tr>
            </TablaPie>
          ) : undefined
        }
      />

      <Paginador
        pagina={pagina}
        total={total}
        porPagina={POR_PAGINA}
        onCambiar={setPagina}
      />

      <MovimientoModal
        abierta={editando !== undefined}
        movimiento={editando}
        onCerrar={() => setEditando(undefined)}
      />
    </div>
  );
}
