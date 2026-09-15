import { AlertCircle, Flag, Plus, SearchX } from 'lucide-react';
import { useState } from 'react';

import { EstadoVacio } from '@/components/estado-vacio';
import { Paginador } from '@/components/paginador';
import { Tabla, TablaEsqueleto, TablaPie, Td, Th, Tr } from '@/components/tabla';
import { rutaSeleccionada, ToolbarFiltros, type Orden } from '@/components/toolbar-filtros';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MovimientoModal } from '@/features/transactions/movimiento-modal';
import { ApiClientError } from '@/lib/api-client';
import { aParametros, useFiltros } from '@/lib/filtros';
import { useActualizarMovimiento, useCategories, useTransactions } from '@/lib/queries';
import { cn, formatCOP } from '@/lib/utils';
import type { Category, Transaction } from '@coco/types';

const POR_PAGINA = 50;

/** Las columnas, en un solo sitio: el esqueleto tiene que tener las mismas. */
const COLUMNAS = ['Concepto', 'Centro de costos', 'Grupo', 'Pago', 'Periodo', 'Valor'];

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

      {movimientos.isPending && (
        <TablaEsqueleto
          columnas={COLUMNAS}
          filas={Math.min(POR_PAGINA, 8)}
        />
      )}

      {movimientos.data && movimientos.data.data.length === 0 && (
        <Card>
          <CardContent className="p-0">
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
          </CardContent>
        </Card>
      )}

      {movimientos.data && movimientos.data.data.length > 0 && (
        <Tabla>
          <thead>
            <tr>
              <Th fija orden={ordenDe('merchant', 'asc')}>Concepto</Th>
              <Th>Centro de costos</Th>
              <Th>Grupo</Th>
              <Th orden={ordenDe('date', 'desc')}>Pago</Th>
              <Th>Periodo</Th>
              <Th alineado="derecha" orden={ordenDe('amount', 'desc')}>
                Valor
              </Th>
            </tr>
          </thead>

          <tbody>
            {movimientos.data.data.map((m) => (
              <Fila key={m.id} movimiento={m} arbol={arbol} onAbrir={() => setEditando(m)} />
            ))}
          </tbody>

          {/* El pie suma el FILTRO ENTERO, no la página: pasar de página no
              puede cambiar el total de lo que se está mirando. */}
          <TablaPie>
            <tr className="border-b border-border">
              <Td fija className="text-muted-foreground">Promedio</Td>
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
        </Tabla>
      )}

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

  // Sin clasificar no es un error, es algo pendiente: la fila se marca para que
  // se vea de lejos cuál falta por ordenar después de una importación.
  const sinClasificar = movimiento.category_id === null;

  return (
    <Tr onClick={onAbrir} atencion={sinClasificar} atenuada={actualizar.isPending}>
      <Td fija atencion={sinClasificar}>
        <span className="flex items-center gap-2">
          {sinClasificar && (
            <Flag className="size-3.5 shrink-0 text-warning" fill="currentColor" aria-label="Sin clasificar" />
          )}
          <span className="block max-w-[14rem] truncate font-medium">
            {movimiento.description ?? movimiento.merchant ?? 'Sin concepto'}
          </span>
        </span>
      </Td>

      {/* Los selectores paran el clic: desplegar una lista no puede abrir
          además el modal que hay detrás. */}
      <Td className="w-48" >
        <span onClick={(e) => e.stopPropagation()}>
          <SelectorEnFila
            aria="Centro de costos"
            valor={centro?.id}
            opciones={arbol}
            onElegir={reclasificar}
          />
        </span>
      </Td>

      <Td className="w-48">
        <span onClick={(e) => e.stopPropagation()}>
          <SelectorEnFila
            aria="Grupo"
            valor={grupo?.id}
            opciones={centro?.children ?? []}
            deshabilitado={!centro}
            onElegir={(id) => reclasificar(id ?? centro?.id)}
          />
        </span>
      </Td>

      <Td className="tabular whitespace-nowrap text-muted-foreground">{diaBonito(movimiento.date)}</Td>

      <Td className="whitespace-nowrap text-muted-foreground">
        <span
          className={cn(
            periodo(movimiento) !== mesDe(movimiento.date) && 'font-medium text-warning',
          )}
        >
          {mesBonito(periodo(movimiento))}
        </span>
      </Td>

      <Td
        alineado="derecha"
        className={cn(
          'tabular whitespace-nowrap font-semibold',
          movimiento.type === 'income' ? 'text-income' : 'text-expense',
        )}
      >
        {movimiento.type === 'income' ? '+' : '−'}
        {formatCOP(movimiento.amount)}
      </Td>
    </Tr>
  );
}

const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

const mesDe = (iso: string): string => iso.slice(0, 7);

/**
 * El periodo del movimiento.
 *
 * Con respaldo en la fecha de pago a propósito: durante un despliegue conviven
 * unos segundos la API vieja —que no manda `period`— y el frontend nuevo, y un
 * campo ausente no puede dejar la pantalla en blanco.
 */
const periodo = (m: Transaction): string => mesDe(m.period ?? m.date);

/** `2026-03-06` → `6 mar 2026`. */
function diaBonito(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1] ?? m} ${a}`;
}

/** `2026-03-01` → `mar 2026`. El periodo es un mes, no un día. */
function mesBonito(iso: string): string {
  const [a, m] = iso.split('-');
  return `${MESES[Number(m) - 1] ?? m} ${a}`;
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
        'outline-none focus-visible:ring-1 focus-visible:ring-ring',
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
