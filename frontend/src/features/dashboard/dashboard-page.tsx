import { AlertCircle, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { TablaDeMovimientos } from '@/components/tabla-de-movimientos';
import { MovimientoModal } from '@/features/transactions/movimiento-modal';
import { Tendencia, TendenciaEsqueleto } from '@/components/tendencia';
import { ToolbarFiltros } from '@/components/toolbar-filtros';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api-client';
import { rangoLargo } from '@/lib/fechas';
import { aParametros, useFiltros } from '@/lib/filtros';
import { useCategories, useDashboard, useTransactions } from '@/lib/queries';
import { formatCOP } from '@/lib/utils';
import type { Transaction } from '@coco/types';

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
 * Cuántas filas entran en una tarjeta del resumen.
 *
 * El mismo número en las dos —movimientos y distribución— para que midan
 * igual. Es un resumen: para ver la lista entera está su pantalla.
 */
const FILAS_EN_TARJETA = 5;

export function DashboardPage() {
  const { filtros, aplicar, limpiar, hayFiltrosActivos } = useFiltros();
  const dashboard = useDashboard(aParametros(filtros));

  // Los mismos filtros que el resto de la pantalla: si la lista de aquí abajo
  // no respondiera al recorte, contradiría las cifras de arriba.
  const movimientos = useTransactions({
    ...aParametros(filtros),
    per_page: FILAS_EN_TARJETA,
    sort: '-date',
  });
  const categorias = useCategories();

  // El mismo modal que en Movimientos: editar desde el resumen no puede ser
  // otra pantalla ni otro formulario.
  const [editando, setEditando] = useState<Transaction | null | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <ToolbarFiltros
        titulo="Tu resumen"
        subtitulo={
          dashboard.data
            ? `${dashboard.data.range.count} movimientos · ${formatCOP(dashboard.data.range.expense)} gastados`
            : 'Todo se calcula de tus movimientos.'
        }
        filtros={filtros}
        aplicar={aplicar}
        limpiar={limpiar}
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
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Card>
            <CardContent className="p-4 sm:p-6">
              <Skeleton className="mb-4 h-6 w-40" />
              <TendenciaEsqueleto />
            </CardContent>
          </Card>
        </>
      )}

      {dashboard.data && (
        <>
          {/* Cuatro en fila desde `xl` y de dos en dos antes: a tres columnas
              la cuarta tarjeta se quedaba sola en un renglón. */}
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
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
            <Distribucion
              filas={dashboard.data.by_category}
              nivel={dashboard.data.breakdown_level}
              totalGastado={dashboard.data.range.expense}
              onBajar={(id) => aplicar({ categoryIds: [id] })}
            />
          </div>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">Comportamiento</h2>
                <p className="text-xs text-muted-foreground">
                  Agrupado por {dashboard.data.period.granularity === 'dia' ? 'día' : 'mes'}
                </p>
              </div>
              <Tendencia
                puntos={dashboard.data.trend}
                granularidad={dashboard.data.period.granularity}
              />
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">Movimientos</h2>
              <Link
                to="/movimientos"
                className="text-sm font-medium text-primary underline underline-offset-4"
              >
                Ver todos
              </Link>
            </div>

            <TablaDeMovimientos
              movimientos={movimientos.data?.data ?? []}
              arbol={categorias.data ?? []}
              cargando={movimientos.isPending}
              onAbrir={setEditando}
              filasDelEsqueleto={FILAS_EN_TARJETA}
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
 * La distribución del gasto, en el tamaño de un indicador.
 *
 * ── Por qué cabe en una tarjeta pequeña ─────────────────────────────────────
 * Porque la pregunta que responde un resumen es "¿en qué se está yendo?", y
 * eso lo contestan las DOS o TRES primeras líneas. El detalle completo —cada
 * concepto, su porcentaje, su número de movimientos— es la tabla de abajo y la
 * pantalla de Centros de costos.
 *
 * Las barras siguen ahí porque comparar longitudes es inmediato y comparar
 * cifras largas no lo es: $63.412.900 contra $29.847.616 obliga a contar
 * dígitos.
 */
function Distribucion({
  filas,
  nivel,
  totalGastado,
  onBajar,
}: {
  filas: { category_id: number | null; name: string; total: string; count: number }[];
  nivel: string;
  totalGastado: string;
  onBajar: (id: number) => void;
}) {
  const total = Number.parseFloat(totalGastado) || 1;
  const CABEN = 3;

  // Sin gastos muestra CEROS, no un estado vacío: es un indicador, y los otros
  // tres de la fila dicen "$0" en la misma situación. Un cartel aquí rompería
  // la fila y haría parecer que esta tarjeta falló mientras las demás no.
  const visibles =
    filas.length > 0
      ? filas.slice(0, CABEN)
      : [{ category_id: null, name: 'Sin gastos', total: '0', count: 0 }];
  const restantes = Math.max(0, filas.length - CABEN);

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col p-4 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Distribución de costos
        </p>

        <ul className="mt-2 flex flex-col gap-2">
            {visibles.map((fila) => {
              const porcentaje = Math.round((Number.parseFloat(fila.total) / total) * 100);
              const interactiva = fila.category_id !== null && nivel !== 'concepto';

              const contenido = (
                <>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{fila.name}</span>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      {porcentaje}%
                    </span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-secondary">
                    <span
                      className="block h-full rounded-full bg-chart-1"
                      style={{ width: `${porcentaje > 0 ? Math.max(porcentaje, 2) : 0}%` }}
                    />
                  </span>
                </>
              );

              return (
                <li key={fila.category_id ?? 'sin'}>
                  {interactiva ? (
                    <button
                      type="button"
                      onClick={() => onBajar(fila.category_id as number)}
                      className="block w-full rounded-lg text-left transition-opacity hover:opacity-80"
                    >
                      {contenido}
                    </button>
                  ) : (
                    <span className="block">{contenido}</span>
                  )}
                </li>
              );
            })}
        </ul>

        {restantes > 0 && (
          <p className="mt-auto pt-2 text-xs text-muted-foreground">
            y {restantes} {restantes === 1 ? 'más' : 'más'} por {nivel}
          </p>
        )}
      </CardContent>
    </Card>
  );
}


