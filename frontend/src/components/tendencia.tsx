import { useRef, useState } from 'react';

import { cn, formatCOP } from '@/lib/utils';
import type { TrendPoint } from '@coco/types';

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
  const lienzo = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState<number | null>(null);

  if (puntos.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No hay movimientos en este rango.
      </p>
    );
  }

  const gastos = puntos.map((p) => Number(p.expense));
  const ingresos = puntos.map((p) => Number(p.income));
  const hayIngresos = ingresos.some((v) => v > 0);
  const techo = Math.max(...gastos, ...(hayIngresos ? ingresos : [0]), 1);

  const total = gastos.reduce((s, v) => s + v, 0);
  const promedio = total / puntos.length;
  const maximo = Math.max(...gastos);
  const pico = puntos[gastos.indexOf(maximo)];

  // Si todo el rango cae en un año, el año sobra en cada etiqueta.
  const mismoAnio = new Set(puntos.map((p) => p.bucket.slice(0, 4))).size === 1;
  const etiquetas = etiquetasDelEje(puntos, granularidad, mismoAnio);

  /** El punto más cercano al dedo o al puntero. */
  function apuntar(clientX: number): void {
    const caja = lienzo.current?.getBoundingClientRect();
    if (!caja || caja.width === 0) return;

    const fraccion = (clientX - caja.left) / caja.width;
    const indice = Math.round(fraccion * (puntos.length - 1));
    setActivo(Math.min(puntos.length - 1, Math.max(0, indice)));
  }

  function conTeclado(e: React.KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const paso = e.key === 'ArrowLeft' ? -1 : 1;
    const desde = activo ?? (paso === 1 ? -1 : puntos.length);
    setActivo(Math.min(puntos.length - 1, Math.max(0, desde + paso)));
  }

  const punto = activo === null ? null : puntos[activo];
  const x = activo === null ? 0 : equis(activo, puntos.length);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          Promedio por {granularidad === 'dia' ? 'día' : 'mes'}{' '}
          <strong className="tabular font-semibold text-foreground">{formatCOP(promedio)}</strong>
        </span>
        <span>
          Pico <strong className="tabular font-semibold text-foreground">{formatCOP(maximo)}</strong>{' '}
          en {etiquetaDeCubo(pico.bucket)}
        </span>
      </div>

      {/*
        El lienzo y lo que se superpone comparten el mismo sistema de
        coordenadas: 0–100 a lo ancho. Por eso la guía, el punto y la tarjeta
        se colocan en HTML con `left: x%` en vez de dibujarse dentro del SVG —
        el SVG se estira sin conservar la proporción, y ahí dentro un círculo
        saldría aplastado y un texto deformado.
      */}
      <div
        ref={lienzo}
        className="relative touch-pan-y outline-none"
        tabIndex={0}
        role="application"
        aria-label={`Gasto por ${granularidad === 'dia' ? 'día' : 'mes'}. Usa las flechas para recorrer los puntos.`}
        onPointerDown={(e) => apuntar(e.clientX)}
        onPointerMove={(e) => apuntar(e.clientX)}
        onPointerLeave={() => setActivo(null)}
        onKeyDown={conTeclado}
        onBlur={() => setActivo(null)}
      >
        <svg
          viewBox="0 0 100 42"
          preserveAspectRatio="none"
          className="h-40 w-full sm:h-56"
          role="img"
          aria-label={`Gasto por ${granularidad === 'dia' ? 'día' : 'mes'}, de ${etiquetaDeCubo(puntos[0].bucket)} a ${etiquetaDeCubo(puntos[puntos.length - 1].bucket)}. Promedio ${formatCOP(promedio)}, pico ${formatCOP(maximo)}.`}
        >
          <defs>
            <linearGradient id="tendencia-relleno" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Tres guías: sin ellas no se puede comparar la altura de un punto
              con la de otro que esté lejos. */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2="100"
              y1={42 * f}
              y2={42 * f}
              stroke="var(--color-border)"
              strokeWidth="0.25"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area(gastos, techo, puntos.length)} fill="url(#tendencia-relleno)" />
          <path
            d={linea(gastos, techo, puntos.length)}
            fill="none"
            stroke="var(--color-chart-1)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {hayIngresos && (
            <path
              d={linea(ingresos, techo, puntos.length)}
              fill="none"
              stroke="var(--color-chart-2)"
              strokeWidth="1.75"
              strokeDasharray="4 3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {punto && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-px bg-border"
              style={{ left: `${x}%` }}
            />
            <Punto x={x} valor={Number(punto.expense)} techo={techo} color="var(--color-chart-1)" />
            {hayIngresos && Number(punto.income) > 0 && (
              <Punto x={x} valor={Number(punto.income)} techo={techo} color="var(--color-chart-2)" />
            )}

            {/*
              La tarjeta salta al lado CONTRARIO del puntero en vez de seguirlo.
              Siguiéndolo se saldría del gráfico en los extremos, y taparía
              justo el punto que se está mirando.
            */}
            <div
              className={cn(
                'pointer-events-none absolute top-0 min-w-36 rounded-xl bg-popover p-3',
                'shadow-[var(--sombra-flotante)] ring-1 ring-black/5 dark:ring-white/12',
                x > 50 ? 'left-0' : 'right-0',
              )}
            >
              <p className="text-xs font-semibold text-muted-foreground">
                {etiquetaDeCubo(punto.bucket)}
              </p>
              <p className="tabular mt-1 font-display text-base font-semibold">
                {formatCOP(Number(punto.expense))}
              </p>
              {hayIngresos && Number(punto.income) > 0 && (
                <p className="tabular mt-0.5 text-xs" style={{ color: 'var(--color-chart-2)' }}>
                  {formatCOP(Number(punto.income))} de ingreso
                </p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {punto.count} {punto.count === 1 ? 'movimiento' : 'movimientos'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* El eje. Las etiquetas se COLOCAN por su posición, no se reparten en
          columnas iguales: repartidas, treinta días dejan once píxeles por
          etiqueta y los números se pisan unos con otros. */}
      <div className="relative h-4">
        {etiquetas.map(({ indice, texto }) => (
          <span
            key={indice}
            className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] text-muted-foreground"
            style={{ left: `${equis(indice, puntos.length)}%` }}
          >
            {texto}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <Leyenda color="var(--color-chart-1)" texto="Gasto" />
        {hayIngresos && <Leyenda color="var(--color-chart-2)" texto="Ingreso" />}
      </div>
    </div>
  );
}

/** El punto resaltado sobre la línea. */
function Punto({
  x,
  valor,
  techo,
  color,
}: {
  x: number;
  valor: number;
  techo: number;
  color: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
      style={{ left: `${x}%`, top: `${(ye(valor, techo) / 42) * 100}%`, backgroundColor: color }}
    />
  );
}

/** Coordenada X de un punto en el lienzo de 0–100. */
function equis(i: number, total: number): number {
  return total === 1 ? 50 : (i / (total - 1)) * 100;
}

/** Coordenada Y: se invierte porque en SVG el 0 está arriba. */
function ye(valor: number, techo: number): number {
  return 42 - (valor / techo) * 42;
}

function linea(serie: number[], techo: number, total: number): string {
  return serie
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${equis(i, total).toFixed(2)} ${ye(v, techo).toFixed(2)}`)
    .join(' ');
}

/** La misma línea, cerrada contra la base, para el relleno. */
function area(serie: number[], techo: number, total: number): string {
  return `${linea(serie, techo, total)} L ${equis(total - 1, total).toFixed(2)} 42 L ${equis(0, total).toFixed(2)} 42 Z`;
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {texto}
    </span>
  );
}

const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/** El último día de un mes: 28, 29, 30 o 31 según cuál sea. */
function ultimoDia(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * Qué puntos del eje llevan etiqueta, y qué dice cada una.
 *
 * ── Menos de tres meses: cada cinco días ────────────────────────────────────
 * 5, 10, 15, 20, 25 y el último del mes —28, 29, 30 o 31, según cuál sea—. El
 * 30 solo aparece cuando de verdad cierra el mes: en un mes de 31 días sería
 * una etiqueta pegada a la siguiente.
 *
 * No se habla de "semanas" porque las semanas no coinciden con los meses: la
 * semana 5 empieza un martes en marzo y un viernes en abril, y comparar dos
 * meses dejaría de ser posible.
 *
 * El NOMBRE DEL MES se escribe solo la primera vez que aparece. Sin él, un
 * rango de dos meses muestra "5 10 15 20 25 31 5 10 15 20 25 30" y no hay
 * forma de saber dónde termina uno y empieza el otro.
 *
 * ── Tres meses o más: solo el mes ───────────────────────────────────────────
 * Y si son tantos que no caben, uno de cada tantos. Doce etiquetas de "mar 25"
 * en un teléfono no se leen: se tocan.
 */
export function etiquetasDelEje(
  puntos: readonly { bucket: string }[],
  granularidad: 'dia' | 'mes',
  mismoAnio: boolean,
): { indice: number; texto: string }[] {
  if (granularidad === 'mes') {
    const cada = Math.max(1, Math.ceil(puntos.length / 12));
    return puntos
      .map((p, indice) => ({ indice, texto: etiquetaDeCubo(p.bucket, mismoAnio) }))
      .filter(({ indice }) => indice % cada === 0);
  }

  const etiquetas: { indice: number; texto: string }[] = [];
  let mesEscrito = '';

  puntos.forEach((p, indice) => {
    const [anio, mes, dia] = p.bucket.split('-').map(Number);
    const esUltimo = dia === ultimoDia(anio, mes);
    // 5, 10, 15, 20 y 25. El 30 queda fuera: o cierra el mes —y entra por la
    // otra condición— o está a un día del 31, que sí lo cierra.
    const esQuinto = dia % 5 === 0 && dia < 26;
    if (!esQuinto && !esUltimo) return;

    const clave = p.bucket.slice(0, 7);
    const texto = clave === mesEscrito ? String(dia) : `${dia} ${MESES[mes - 1] ?? mes}`;
    mesEscrito = clave;

    etiquetas.push({ indice, texto });
  });

  return etiquetas;
}

/**
 * `2025-03-14` → `14 mar`. `2025-03` → `mar 25`, o solo `mar` si todo el rango
 * cae en el mismo año.
 *
 * Repetir el año en los doce puntos de un mismo año es ruido: ocupa espacio,
 * hace que las etiquetas se pisen y no distingue un punto de otro. Solo aporta
 * cuando el rango cruza de año.
 */
export function etiquetaDeCubo(bucket: string, mismoAnio = false): string {
  const [anio, mes, dia] = bucket.split('-');
  const nombre = MESES[Number(mes) - 1] ?? mes;
  if (dia) return `${Number(dia)} ${nombre}`;
  return mismoAnio ? nombre : `${nombre} ${anio.slice(2)}`;
}
