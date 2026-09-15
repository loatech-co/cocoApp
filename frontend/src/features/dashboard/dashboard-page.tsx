import { AlertCircle, ChevronRight, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Tendencia } from '@/components/tendencia';
import { ToolbarFiltros } from '@/components/toolbar-filtros';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api-client';
import { aParametros, useFiltros } from '@/lib/filtros';
import { useDashboard } from '@/lib/queries';
import { formatCOP } from '@/lib/utils';

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
export function DashboardPage() {
  const { filtros, aplicar, limpiar, hayFiltrosActivos } = useFiltros();
  const dashboard = useDashboard(aParametros(filtros));

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

      {dashboard.isPending && <Esqueleto />}

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
              detalle={`${dashboard.data.period.from} a ${dashboard.data.period.to}`}
              Icono={Receipt}
              chip="lima"
            />
          </div>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-semibold">Comportamiento</h2>
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

          <Desglose
            filas={dashboard.data.by_category}
            nivel={dashboard.data.breakdown_level}
            totalGastado={dashboard.data.range.expense}
            onBajar={(id) => aplicar({ categoryId: id })}
          />
        </>
      )}
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
function Desglose({
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

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">En qué se fue</h2>
          <p className="text-xs text-muted-foreground">Por {nivel}</p>
        </div>

        {filas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay gastos en este recorte.
          </p>
        ) : (
          <ul className="flex flex-col">
            {filas.map((fila) => {
              const porcentaje = Math.round((Number.parseFloat(fila.total) / total) * 100);
              const interactiva = fila.category_id !== null && nivel !== 'concepto';

              const contenido = (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">{fila.name}</span>
                    <span className="tabular shrink-0 text-sm font-semibold">
                      {formatCOP(fila.total)}
                    </span>
                  </div>
                  {/* La barra no es decoración: comparar cifras largas de un
                      vistazo es difícil, comparar longitudes es inmediato. */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-chart-1"
                        style={{ width: `${Math.max(porcentaje, 1)}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">
                      {porcentaje}% · {fila.count}
                    </span>
                    {interactiva && (
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </>
              );

              return (
                <li key={fila.category_id ?? 'sin'} className="border-b border-border last:border-0">
                  {interactiva ? (
                    <button
                      type="button"
                      onClick={() => onBajar(fila.category_id as number)}
                      className="w-full rounded-lg px-1 py-3 text-left transition-colors hover:bg-secondary"
                    >
                      {contenido}
                    </button>
                  ) : (
                    <div className="px-1 py-3">{contenido}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Link
          to="/movimientos"
          className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-4"
        >
          Ver los movimientos
        </Link>
      </CardContent>
    </Card>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
