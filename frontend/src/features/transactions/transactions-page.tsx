import { AlertCircle, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';

import { rutaSeleccionada } from '@/components/toolbar-filtros';
import { ToolbarFiltros } from '@/components/toolbar-filtros';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MovimientoModal } from '@/features/transactions/movimiento-modal';
import { ApiClientError } from '@/lib/api-client';
import { aParametros, useFiltros } from '@/lib/filtros';
import { useActualizarMovimiento, useCategories, useTransactions } from '@/lib/queries';
import { cn, formatCOP } from '@/lib/utils';
import type { Category, Transaction } from '@coco/types';

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
  const { filtros, aplicar, limpiar, hayFiltrosActivos } = useFiltros();
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<Transaction | null | undefined>(undefined);

  const movimientos = useTransactions({
    ...aParametros(filtros),
    page: pagina,
    per_page: POR_PAGINA,
    sort: '-date',
  });

  const categorias = useCategories();
  const arbol = categorias.data ?? [];

  const total = movimientos.data?.meta?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Movimientos
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Toca una fila para editarla completa.
          </p>
        </div>
        <Button type="button" onClick={() => setEditando(null)}>
          <Plus className="size-4" aria-hidden="true" />
          Nuevo
        </Button>
      </header>

      <ToolbarFiltros
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
        resumen={total > 0 ? `${total} movimiento(s)` : undefined}
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

      {movimientos.isPending && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      )}

      {movimientos.data && movimientos.data.data.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No hay movimientos con estos filtros.
            </p>
          </CardContent>
        </Card>
      )}

      {movimientos.data && movimientos.data.data.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {movimientos.data.data.map((m) => (
                <Fila key={m.id} movimiento={m} arbol={arbol} onAbrir={() => setEditando(m)} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {paginas > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Paginación">
          <Button
            type="button"
            variant="outline"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            {pagina} de {paginas}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={pagina >= paginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Siguiente
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </nav>
      )}

      <MovimientoModal
        abierta={editando !== undefined}
        movimiento={editando}
        onCerrar={() => setEditando(undefined)}
      />
    </div>
  );
}

function Fila({
  movimiento,
  arbol,
  onAbrir,
}: {
  movimiento: Transaction;
  arbol: Category[];
  onAbrir: () => void;
}) {
  const actualizar = useActualizarMovimiento();
  const { centro, grupo } = rutaSeleccionada(arbol, movimiento.category_id ?? undefined);

  // Cambiar el selector guarda EXACTAMENTE lo elegido, sin adivinar el resto.
  // La tentación es "conservar el concepto si existe con el mismo nombre en el
  // grupo nuevo", pero eso mueve plata a un sitio que nadie pidió y nadie ve.
  const reclasificar = (id: number | undefined): void => {
    actualizar.mutate({ id: movimiento.id, cambios: { category_id: id ?? null } });
  };

  return (
    <li className={cn('transition-opacity', actualizar.isPending && 'opacity-50')}>
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        {/* Zona que abre el modal. Los selectores quedan FUERA: un clic para
            desplegar una lista no puede abrir un modal encima. */}
        <button
          type="button"
          onClick={onAbrir}
          className="flex min-w-0 flex-1 items-baseline justify-between gap-3 rounded-lg text-left sm:block"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {movimiento.description ?? 'Sin concepto'}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{movimiento.date}</span>
          </span>
          <span
            className={cn(
              'tabular shrink-0 text-sm font-semibold sm:hidden',
              movimiento.type === 'income' ? 'text-income' : 'text-expense',
            )}
          >
            {movimiento.type === 'income' ? '+' : '−'}
            {formatCOP(movimiento.amount)}
          </span>
        </button>

        <div className="flex gap-2 sm:w-96 sm:shrink-0">
          <SelectorEnFila
            aria="Centro de costos"
            valor={centro?.id}
            opciones={arbol}
            onElegir={reclasificar}
          />
          <SelectorEnFila
            aria="Grupo"
            valor={grupo?.id}
            opciones={centro?.children ?? []}
            deshabilitado={!centro}
            onElegir={(id) => reclasificar(id ?? centro?.id)}
          />
        </div>

        <span
          className={cn(
            'tabular hidden w-36 shrink-0 text-right text-sm font-semibold sm:block',
            movimiento.type === 'income' ? 'text-income' : 'text-expense',
          )}
        >
          {movimiento.type === 'income' ? '+' : '−'}
          {formatCOP(movimiento.amount)}
        </span>
      </div>
    </li>
  );
}

function SelectorEnFila({
  aria,
  valor,
  opciones,
  deshabilitado,
  onElegir,
}: {
  aria: string;
  valor?: number;
  opciones: Category[];
  deshabilitado?: boolean;
  onElegir: (id: number | undefined) => void;
}) {
  return (
    <select
      aria-label={aria}
      value={valor ?? ''}
      disabled={deshabilitado || opciones.length === 0}
      onChange={(e) => onElegir(e.target.value === '' ? undefined : Number(e.target.value))}
      className={cn(
        'min-w-0 flex-1 truncate rounded-lg border bg-card px-2 py-1.5 text-xs',
        'disabled:cursor-not-allowed disabled:opacity-40',
      )}
      style={{ borderColor: 'var(--input)' }}
    >
      <option value="">{aria}…</option>
      {opciones.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
