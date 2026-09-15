import { formatCOP } from '@/lib/utils';
import type { TrendPoint } from '@coco/types';

/**
 * El comportamiento del gasto, en barras.
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

  // Con muchos cubos las etiquetas se pisan: se muestran salteadas.
  const cada = Math.max(1, Math.ceil(puntos.length / 8));

  // Si todo el rango cae en un año, el año sobra en cada etiqueta.
  const mismoAnio = new Set(puntos.map((p) => p.bucket.slice(0, 4))).size === 1;

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

      {/* Línea, en un lienzo de 0–100 por lado: el SVG escala solo al ancho
          disponible y no hay que medir el contenedor. */}
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

        {/* Tres guías: sin ellas no se puede comparar la altura de un punto con
            la de otro que esté lejos. */}
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

      <div className="flex justify-between text-[11px] text-muted-foreground">
        {puntos.map((punto, i) => (
          <span key={punto.bucket} className="flex-1 text-center">
            {i % cada === 0 ? etiquetaDeCubo(punto.bucket, mismoAnio) : '\u00A0'}
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
