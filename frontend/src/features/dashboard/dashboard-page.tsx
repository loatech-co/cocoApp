import { AlertCircle, ChevronLeft, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';

import { Dona } from '@/components/dona';
import { Paginador } from '@/components/paginador';
import { TablaDeMovimientos } from '@/components/tabla-de-movimientos';
import { TablaPie, Td } from '@/components/tabla';
import { MovimientoModal } from '@/features/transactions/movimiento-modal';
import { Tendencia, TendenciaEsqueleto } from '@/components/tendencia';
import { rutaSeleccionada, ToolbarFiltros, type Orden } from '@/components/toolbar-filtros';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api-client';
import { rangoLargo } from '@/lib/fechas';
import { useAuth } from '@/lib/auth-context';
import { aParametros, useFiltros } from '@/lib/filtros';
import { useCategories, useDashboard, useTransactions } from '@/lib/queries';
import { formatCOP } from '@/lib/utils';
import type { Category, Transaction } from '@coco/types';

/**
 * Resumen.
 *
 * Todas las cifras son DERIVADAS: no hay ni una columna de saldo en la base.
 * Si un movimiento cambia, esto cambia solo.
 *
 * La pantalla se lee de arriba abajo como una sola pregunta que se va
 * acotando: qué recorte estoy mirando (toolbar), cuánto suma (indicadores),
 * cómo se comportó en el tiempo (tendencia) y en qué se fue (desglose).
 */
/**
 * Cuántas filas trae cada página de la tabla del resumen.
 *
 * La tabla enseña TODO lo que cae en el recorte, paginado. Enseñar "solo un
 * poco" obliga a saltar a otra pantalla para terminar la pregunta que uno ya
 * estaba haciendo aquí.
 */
const POR_PAGINA = 25;

/**
 * El nombre con el que saludar.
 *
 * Solo el de pila: "Hola de nuevo, Gerardo Andrés Viteri" no saluda a nadie,
 * recita un documento de identidad. Si no hay nombre, el correo tampoco sirve
 * para saludar, así que el saludo se queda solo.
 */
function nombreDePila(usuario: { display_name?: string | null } | null | undefined): string {
  return (usuario?.display_name ?? '').trim().split(/\s+/)[0] ?? '';
}

export function DashboardPage() {
  const { usuario } = useAuth();
  const { filtros, aplicar, limpiar, hayFiltrosActivos } = useFiltros();
  const dashboard = useDashboard(aParametros(filtros));

  // Los mismos filtros que el resto de la pantalla: si la lista de aquí abajo
  // no respondiera al recorte, contradiría las cifras de arriba.
  const [pagina, setPagina] = useState(1);
  const [orden, setOrden] = useState<Orden>('-date');
  const movimientos = useTransactions({
    ...aParametros(filtros),
    page: pagina,
    per_page: POR_PAGINA,
    sort: orden,
  });
  const categorias = useCategories();
  const arbol = categorias.data ?? [];

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

  // El camino hasta lo que se está desglosando. Solo con UNA categoría marcada:
  // con varias no hay un "dentro de" único del que volver.
  const ruta =
    filtros.categoryIds.length === 1
      ? (() => {
          const { centro, grupo, concepto } = rutaSeleccionada(arbol, filtros.categoryIds[0]);
          return [centro, grupo, concepto].filter((n): n is Category => n !== undefined);
        })()
      : [];

  // El mismo modal que en Movimientos: editar desde el resumen no puede ser
  // otra pantalla ni otro formulario.
  const [editando, setEditando] = useState<Transaction | null | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <ToolbarFiltros
        titulo={`Hola de nuevo${nombreDePila(usuario) ? `, ${nombreDePila(usuario)}` : ''}`}
        subtitulo={
          dashboard.data
            ? `${dashboard.data.range.count} movimientos · ${formatCOP(dashboard.data.range.expense)} gastados`
            : 'Todo se calcula de tus movimientos.'
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
      />

      {dashboard.isError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>No se pudo cargar el resumen</AlertTitle>
          <AlertDescription>
            {dashboard.error instanceof ApiClientError
              ? dashboard.error.message
              : 'Revisa que la API esté corriendo.'}
          </AlertDescription>
        </Alert>
      )}

      {dashboard.isPending && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 sm:gap-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-3 sm:gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="flex h-full flex-col p-4 sm:p-6">
                <Skeleton className="mb-4 h-6 w-40" />
                <div className="h-56 sm:h-72">
                  <TendenciaEsqueleto />
                </div>
              </CardContent>
            </Card>
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        </>
      )}

      {dashboard.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 sm:gap-5">
            <Kpi
              etiqueta="Gastos del periodo"
              valor={formatCOP(dashboard.data.range.expense)}
              Icono={TrendingDown}
              acento="expense"
              chip="violeta"
            />
            <Kpi
              etiqueta="Ingresos del periodo"
              valor={formatCOP(dashboard.data.range.income)}
              Icono={TrendingUp}
              acento="income"
              chip="verde"
            />
            <Kpi
              etiqueta="Movimientos"
              valor={String(dashboard.data.range.count)}
              detalle={rangoLargo(dashboard.data.period.from, dashboard.data.period.to)}
              Icono={Receipt}
              chip="lima"
            />
          </div>

          {/* La gráfica dice CUÁNDO se gastó y la dona EN QUÉ. Son la misma
              pregunta partida en dos, así que van a la misma altura: una
              debajo de la otra obliga a desplazarse para cruzarlas. */}
          {/* MISMA rejilla y mismo hueco que la fila de indicadores: con 10
              columnas arriba y 3 abajo, la dona quedaba unos píxeles corrida
              respecto de la tarjeta que tiene encima y el borde no cuadraba. */}
          <div className="grid gap-3 sm:gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="flex h-full flex-col p-4 sm:p-6">
                <h2 className="mb-4 font-display text-lg font-semibold">Comportamiento</h2>
                {/* Alto PROPIO y no `flex-1` a secas. Dejándolo crecer, el SVG
                    caía en su proporción del viewBox —2.4:1— y en una tarjeta
                    ancha se estiraba a 340px, arrastrando la fila entera y
                    dejando media tarjeta vacía en la dona de al lado. */}
                <div className="h-56 sm:h-72">
                  <Tendencia
                    puntos={dashboard.data.trend}
                    granularidad={dashboard.data.period.granularity}
                  />
                </div>
              </CardContent>
            </Card>

            <div>
              <Distribucion
                filas={dashboard.data.by_category}
                nivel={dashboard.data.breakdown_level}
                totalGastado={dashboard.data.range.expense}
                ruta={ruta}
                onBajar={(id) => {
                  setPagina(1);
                  aplicar({ categoryIds: [id] });
                }}
                onSubir={() => {
                  setPagina(1);
                  aplicar({ categoryIds: ruta.length > 1 ? [ruta[ruta.length - 2].id] : [] });
                }}
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">Movimientos</h2>
              {(movimientos.data?.meta?.total ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {(pagina - 1) * POR_PAGINA + 1} a{' '}
                  {Math.min(pagina * POR_PAGINA, movimientos.data!.meta.total)} de{' '}
                  {movimientos.data!.meta.total}
                </p>
              )}
            </div>

            <TablaDeMovimientos
              movimientos={movimientos.data?.data ?? []}
              arbol={arbol}
              cargando={movimientos.isPending}
              onAbrir={setEditando}
              orden={ordenDe}
              filasDelEsqueleto={8}
              pie={
                movimientos.data && movimientos.data.data.length > 0 ? (
                  <TablaPie>
                    <tr>
                      <Td fija divisor={false}>
                        Total · {movimientos.data.meta.total} movimientos
                      </Td>
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
              total={movimientos.data?.meta?.total ?? 0}
              porPagina={POR_PAGINA}
              onCambiar={setPagina}
            />
          </div>
        </>
      )}

      <MovimientoModal
        abierta={editando !== undefined}
        movimiento={editando}
        onCerrar={() => setEditando(undefined)}
      />
    </div>
  );
}

/** Cada tarjeta lleva su pastel: distinguirlas de un vistazo es más rápido
    que leer la etiqueta de cada una. */
const CHIPS = {
  violeta: { fondo: 'var(--color-chip-violeta)', tinta: 'var(--color-chip-violeta-tinta)' },
  turquesa: { fondo: 'var(--color-chip-turquesa)', tinta: 'var(--color-chip-turquesa-tinta)' },
  verde: { fondo: 'var(--color-chip-verde)', tinta: 'var(--color-chip-verde-tinta)' },
  lima: { fondo: 'var(--color-chip-lima)', tinta: 'var(--color-chip-lima-tinta)' },
} as const;

function Kpi({
  etiqueta,
  valor,
  detalle,
  Icono,
  acento,
  chip = 'turquesa',
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  Icono: React.ComponentType<{
    className?: string;
    'aria-hidden'?: boolean;
    fill?: string;
    fillOpacity?: number;
    strokeWidth?: number;
  }>;
  acento?: 'income' | 'expense';
  chip?: keyof typeof CHIPS;
}) {
  const { fondo, tinta } = CHIPS[chip];

  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4 sm:gap-4 sm:p-6">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-full sm:size-12"
          style={{ backgroundColor: fondo, color: tinta }}
        >
          <Icono className="size-5" fill="currentColor" fillOpacity={0.2} strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {etiqueta}
          </p>
          <p
            className={
              'tabular mt-1 truncate text-2xl font-semibold leading-tight sm:text-[28px] ' +
              (acento === 'income' ? 'text-income' : acento === 'expense' ? 'text-expense' : '')
            }
          >
            {valor}
          </p>
          {detalle && <p className="mt-1 truncate text-xs text-muted-foreground">{detalle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * En qué se fue, al nivel que corresponda.
 *
 * Cada fila BAJA un nivel al tocarla: de centros a grupos, de grupos a
 * conceptos. Es la forma de responder "¿y dentro de esto, qué?" sin cambiar de
 * pantalla ni perder el rango de fechas.
 */
/**
 * En qué se repartió el gasto.
 *
 * ── Por qué una dona y no barras ────────────────────────────────────────────
 * Porque la pregunta es de PROPORCIÓN, no de ranking: cuánto se lleva cada
 * centro DEL TOTAL. Una fila de barras compara unas con otras y deja el total
 * implícito; la dona lo pone en el centro y cada porción se lee contra él sin
 * hacer ninguna cuenta.
 */
function Distribucion({
  filas,
  nivel,
  totalGastado,
  ruta,
  onBajar,
  onSubir,
}: {
  filas: { category_id: number | null; name: string; total: string; count: number }[];
  nivel: string;
  totalGastado: string;
  /** El camino hasta donde se bajó. Vacío = se está en los centros de costos. */
  ruta: { id: number; name: string }[];
  onBajar: (id: number) => void;
  onSubir: () => void;
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col p-4 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Distribución de costos</h2>

        {/* Bajar de nivel es un clic; subir tiene que serlo también. Sin esto,
            entrar en un centro de costos era un viaje de ida: la única salida
            era limpiar el filtro entero desde la barra de arriba. */}
        {ruta.length > 0 ? (
          <button
            type="button"
            onClick={onSubir}
            className="mt-1.5 flex min-w-0 items-center gap-1 self-start rounded text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{ruta.map((n) => n.name).join(' · ')}</span>
          </button>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">Por {nivel}</p>
        )}

        <Dona
          className="mt-6"
          total={Number.parseFloat(totalGastado) || 0}
          porciones={filas.map((f) => ({
            id: f.category_id,
            nombre: f.name,
            valor: Number.parseFloat(f.total) || 0,
          }))}
          onElegir={nivel === 'concepto' ? undefined : onBajar}
        />
      </CardContent>
    </Card>
  );
}


