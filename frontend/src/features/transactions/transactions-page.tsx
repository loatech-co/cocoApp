import type { Transaction } from '@coco/types';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Monto } from '@/components/monto';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAccounts,
  useCategories,
  useEliminarMovimiento,
  useTransactions,
  type FiltrosDeMovimientos,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

const POR_PAGINA = 25;

/** M1 — Movimientos. El núcleo operativo del producto. */
export function TransactionsPage() {
  const [filtros, setFiltros] = useState<FiltrosDeMovimientos>({
    page: 1,
    per_page: POR_PAGINA,
  });
  const [busqueda, setBusqueda] = useState('');

  const movimientos = useTransactions(filtros);
  const cuentas = useAccounts(true);
  const categorias = useCategories();

  const nombreDeCuenta = useMemo(
    () => new Map((cuentas.data ?? []).map((cuenta) => [cuenta.id, cuenta.name])),
    [cuentas.data],
  );

  const nombreDeCategoria = useMemo(() => {
    const mapa = new Map<number, { name: string; color: string | null }>();
    for (const padre of categorias.data ?? []) {
      mapa.set(padre.id, { name: padre.name, color: padre.color });
      for (const hijo of padre.children ?? []) {
        mapa.set(hijo.id, { name: hijo.name, color: hijo.color });
      }
    }
    return mapa;
  }, [categorias.data]);

  const total = movimientos.data?.meta.total ?? 0;
  const pagina = filtros.page ?? 1;
  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA));

  function buscar(): void {
    setFiltros((actuales) => ({ ...actuales, q: busqueda || undefined, page: 1 }));
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Movimientos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total > 0 ? `${total} movimiento${total === 1 ? '' : 's'}` : 'Todavía no hay nada aquí'}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            onKeyDown={(evento) => evento.key === 'Enter' && buscar()}
            placeholder="Buscar por comercio o descripción…"
            className="pl-9"
            aria-label="Buscar movimientos"
          />
        </div>

        <select
          value={filtros.type ?? ''}
          onChange={(evento) =>
            setFiltros((actuales) => ({
              ...actuales,
              type: (evento.target.value || undefined) as Transaction['type'] | undefined,
              page: 1,
            }))
          }
          className="h-10 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos los tipos</option>
          <option value="expense">Gastos</option>
          <option value="income">Ingresos</option>
          <option value="transfer">Transferencias</option>
        </select>

        <Button variant="outline" onClick={buscar}>
          Filtrar
        </Button>
      </div>

      {movimientos.isPending && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, indice) => (
            <Skeleton key={indice} className="h-16" />
          ))}
        </div>
      )}

      {movimientos.isSuccess && movimientos.data.data.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No hay movimientos que coincidan. Usa el botón ＋ para registrar el primero.
            </p>
          </CardContent>
        </Card>
      )}

      {movimientos.isSuccess && movimientos.data.data.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {movimientos.data.data.map((movimiento) => (
              <Fila
                key={movimiento.id}
                movimiento={movimiento}
                nombreDeCuenta={
                  movimiento.account_id !== null
                    ? (nombreDeCuenta.get(movimiento.account_id) ?? '—')
                    : null
                }
                categoria={
                  movimiento.category_id === null
                    ? null
                    : (nombreDeCategoria.get(movimiento.category_id) ?? null)
                }
              />
            ))}
          </ul>

          {ultimaPagina > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Paginación">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1}
                onClick={() => setFiltros((a) => ({ ...a, page: pagina - 1 }))}
              >
                <ChevronLeft aria-hidden="true" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {pagina} de {ultimaPagina}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= ultimaPagina}
                onClick={() => setFiltros((a) => ({ ...a, page: pagina + 1 }))}
              >
                Siguiente
                <ChevronRight aria-hidden="true" />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function Fila({
  movimiento,
  nombreDeCuenta,
  categoria,
}: {
  movimiento: Transaction;
  /** `null` cuando el movimiento no pertenece a ninguna cuenta. */
  nombreDeCuenta: string | null;
  categoria: { name: string; color: string | null } | null;
}) {
  const eliminar = useEliminarMovimiento();
  const esPendiente = movimiento.status === 'pending';

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3',
        esPendiente && 'opacity-70',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">
            {movimiento.merchant ?? movimiento.description ?? 'Sin descripción'}
          </p>
          {movimiento.type === 'transfer' && (
            <ArrowLeftRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{movimiento.date}</span>

          {/* Sin cuenta no se escribe "—" ni "sin cuenta": simplemente no hay
              nada que decir, y una etiqueta de relleno solo añade ruido a una
              lista que se lee de un vistazo. */}
          {nombreDeCuenta !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{nombreDeCuenta}</span>
            </>
          )}

          {categoria ? (
            <Badge variant="outline" className="ml-1">
              {categoria.color && (
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: categoria.color }}
                  aria-hidden="true"
                />
              )}
              {categoria.name}
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-1 text-muted-foreground">
              Sin categorizar
            </Badge>
          )}

          {esPendiente && <Badge variant="warning">Pendiente</Badge>}

          {movimiento.tags.map((etiqueta) => (
            <Badge key={etiqueta} variant="info">
              {etiqueta}
            </Badge>
          ))}
        </div>
      </div>

      <Monto amount={movimiento.amount} type={movimiento.type} />

      <Button
        variant="ghost"
        size="sm"
        aria-label="Eliminar movimiento"
        disabled={eliminar.isPending}
        onClick={() => {
          if (window.confirm('¿Eliminar este movimiento? No se puede deshacer.')) {
            eliminar.mutate(movimiento.id);
          }
        }}
      >
        <Trash2 className="text-muted-foreground" aria-hidden="true" />
      </Button>
    </li>
  );
}
