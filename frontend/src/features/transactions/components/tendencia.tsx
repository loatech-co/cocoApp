import { ChartLine } from 'lucide-react';

import { sitioDeLaTarjeta, useTrendPointer } from '@/features/transactions/hooks/use-trend-pointer';
import {
  equis,
  etiquetaDeCubo,
  etiquetasDelEje,
  unidad,
} from '@/features/transactions/model/trend';
import { type TrendPoint } from '@/shared/api/generated/model';
import { formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { EstadoVacio } from '@/shared/ui/atoms/estado-vacio';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

import { Punto, TrendAxis, TrendCard, TrendLines, TrendSummary } from './trend-parts';

/**
 * El comportamiento del gasto, en una línea.
 *
 * ── Línea, no barras ────────────────────────────────────────────────────────
 * Lo que interesa aquí es la TENDENCIA: si el gasto sube o baja mes a mes. La
 * línea lo dice de un vistazo; una barra obliga a comparar alturas de a pares.
 *
 * ── Por qué SVG a mano ──────────────────────────────────────────────────────
 * Una librería de gráficas pesa más que el resto de la app junta, y trae su
 * propia paleta y su propia tipografía contra las que hay que pelear.
 */
export function Tendencia({
  puntos,
  granularidad,
}: {
  puntos: TrendPoint[];
  granularidad: 'dia' | 'mes';
}) {
  // Los cubos vacíos vienen a propósito de la API —un mes en blanco tiene que
  // verse plano dentro de una serie—, pero si TODOS están en cero no hay serie
  // que dibujar: una línea pegada al suelo afirma "gastaste cero", que no es lo
  // mismo que "no hay nada que mostrar".
  const vacia = puntos.every((p) => Number(p.expense) === 0 && Number(p.income) === 0);

  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];

  if (primero === undefined || ultimo === undefined || vacia) {
    return (
      <EstadoVacio
        className="h-full"
        Icono={ChartLine}
        titulo={t('transactions.trend.emptyTitle')}
        ayuda={t('transactions.trend.emptyHelp')}
      />
    );
  }

  return <Grafica puntos={puntos} granularidad={granularidad} extremos={{ primero, ultimo }} />;
}

/** Las cifras que salen de la serie: el techo del lienzo, el promedio y el pico. */
function resumen(puntos: TrendPoint[]) {
  const gastos = puntos.map((p) => Number(p.expense));
  const ingresos = puntos.map((p) => Number(p.income));
  const hayIngresos = ingresos.some((v) => v > 0);
  const techo = Math.max(...gastos, ...(hayIngresos ? ingresos : [0]), 1);

  const total = gastos.reduce((s, v) => s + v, 0);
  const promedio = total / puntos.length;
  const maximo = Math.max(...gastos);
  return { gastos, ingresos, hayIngresos, techo, promedio, maximo };
}

function Grafica({
  puntos,
  granularidad,
  extremos: { primero, ultimo },
}: {
  puntos: TrendPoint[];
  granularidad: 'dia' | 'mes';
  extremos: { primero: TrendPoint; ultimo: TrendPoint };
}) {
  const s = resumen(puntos);
  // `maximo` sale de `gastos`, así que siempre se encuentra: el respaldo no se usa.
  const pico = puntos[s.gastos.indexOf(s.maximo)] ?? primero;
  const periodo = unidad(granularidad);

  return (
    // `h-full` y el lienzo en `flex-1`: la tarjeta la estira su vecina de al
    // lado, y una gráfica de alto fijo dejaba media tarjeta en blanco debajo.
    <div className="flex h-full flex-col gap-4">
      <TrendSummary
        granularidad={granularidad}
        promedio={s.promedio}
        maximo={s.maximo}
        pico={pico}
      />

      <Lienzo puntos={puntos} granularidad={granularidad} resumen={s}>
        <TrendLines
          gastos={s.gastos}
          ingresos={s.ingresos}
          hayIngresos={s.hayIngresos}
          techo={s.techo}
          ariaLabel={t('transactions.trend.chartLabel', {
            unit: periodo,
            from: etiquetaDeCubo(primero.bucket),
            to: etiquetaDeCubo(ultimo.bucket),
            average: formatCOP(s.promedio),
            peak: formatCOP(s.maximo),
          })}
        />
      </Lienzo>

      <TrendAxis etiquetas={etiquetasDelEje(puntos, granularidad)} total={puntos.length} />
    </div>
  );
}

function Lienzo({
  puntos,
  granularidad,
  resumen: { techo, hayIngresos },
  children,
}: {
  puntos: TrendPoint[];
  granularidad: 'dia' | 'mes';
  resumen: ReturnType<typeof resumen>;
  children: React.ReactNode;
}) {
  const { lienzo, tarjeta, activo, setActivo, caja, tamTarjeta, apuntar, conTeclado } =
    useTrendPointer(puntos.length);
  const punto = activo === null ? null : puntos[activo];

  return (
    /*
      El lienzo y lo que se superpone comparten el mismo sistema de
      coordenadas: 0–100 a lo ancho. Por eso la guía, el punto y la tarjeta
      se colocan en HTML con `left: x%` en vez de dibujarse dentro del SVG —
      el SVG se estira sin conservar la proporción, y ahí dentro un círculo
      saldría aplastado y un texto deformado.
    */
    <div
      ref={lienzo}
      // `min-h-0` deja que el flex lo encoja; sin eso el hijo impone su alto
      // mínimo y el contenedor se desborda.
      className={cn(
        'relative min-h-40 min-w-0 flex-1 touch-pan-y rounded-lg',
        // La gráfica ENTRA en el orden del tabulador y se recorre con las
        // flechas —lo dice su propia etiqueta—, pero llevaba `outline-none`
        // sin nada que lo reemplazara: quien llegaba aquí con el teclado no
        // tenía forma de saberlo. El anillo va por dentro porque la gráfica
        // llena su tarjeta hasta el borde.
        'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      )}
      tabIndex={0}
      role="application"
      aria-label={t('transactions.trend.pointerLabel', { unit: unidad(granularidad) })}
      onPointerDown={(e) => apuntar(e.clientX)}
      onPointerMove={(e) => apuntar(e.clientX)}
      onPointerLeave={() => setActivo(null)}
      onKeyDown={conTeclado}
      onBlur={() => setActivo(null)}
    >
      {children}

      {punto && activo !== null && (
        <Senalado
          punto={punto}
          indice={activo}
          total={puntos.length}
          techo={techo}
          hayIngresos={hayIngresos}
          tarjeta={tarjeta}
          caja={caja}
          tamTarjeta={tamTarjeta}
        />
      )}
    </div>
  );
}

/** La guía vertical, los puntos y la tarjeta del punto señalado. */
function Senalado({
  punto,
  indice,
  total,
  techo,
  hayIngresos,
  tarjeta,
  caja,
  tamTarjeta,
}: {
  punto: TrendPoint;
  indice: number;
  total: number;
  techo: number;
  hayIngresos: boolean;
  tarjeta: React.RefObject<HTMLDivElement | null>;
  caja: { ancho: number; alto: number };
  tamTarjeta: { ancho: number; alto: number };
}) {
  const x = equis(indice, total);
  const valor = Number(punto.expense);
  const sitio = sitioDeLaTarjeta({ indice, total, valor, techo, caja, tamTarjeta });

  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-px bg-border"
        style={{ left: `${x}%` }}
      />
      <Punto x={x} valor={valor} techo={techo} color="var(--color-expense)" />
      {hayIngresos && Number(punto.income) > 0 && (
        <Punto x={x} valor={Number(punto.income)} techo={techo} color="var(--color-income)" />
      )}
      <TrendCard
        tarjeta={tarjeta}
        punto={punto}
        sitio={sitio}
        medida={tamTarjeta.ancho !== 0}
        hayIngresos={hayIngresos}
      />
    </>
  );
}

/**
 * La gráfica mientras llega su dato.
 *
 * Con la misma forma que la gráfica de verdad: cabecera, lienzo que se estira
 * y fila de etiquetas. Un esqueleto de otro tamaño hace que la página dé un
 * salto justo cuando llegan los datos, que es el momento en que alguien está a
 * punto de pulsar algo.
 */
export function TendenciaEsqueleto() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex gap-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="min-h-40 w-full flex-1 rounded-lg" />
      <div className="flex justify-between">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-3 w-8" />
        ))}
      </div>
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
