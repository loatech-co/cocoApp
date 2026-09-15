import { formatCOP } from '@/lib/utils';
import type { TrendPoint } from '@coco/types';

/**
 * El comportamiento del gasto, en barras.
 *
 * ── Por qué barras y no una línea ───────────────────────────────────────────
 * Una línea sugiere continuidad: que entre marzo y abril el gasto "pasó por"
 * los valores intermedios. Con gasto mensual eso es falso — son montos
 * discretos, y compararlos es exactamente lo que se quiere. La barra invita a
 * comparar alturas; la línea, a leer una pendiente que no significa nada.
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

      {/* Alto fijo y barras flexibles: así el gráfico se adapta al ancho sin
          deformar las proporciones verticales, que es lo que se compara. */}
      <div
        className="flex h-40 items-end gap-[3px] sm:h-56 sm:gap-1.5"
        role="img"
        aria-label={`Gasto por ${granularidad === 'dia' ? 'día' : 'mes'}, de ${etiquetaDeCubo(puntos[0].bucket)} a ${etiquetaDeCubo(puntos[puntos.length - 1].bucket)}. Promedio ${formatCOP(promedio)}, pico ${formatCOP(maximo)}.`}
      >
        {puntos.map((punto, i) => (
          <div key={punto.bucket} className="group relative flex h-full flex-1 items-end gap-[2px]">
            <Barra
              valor={gastos[i]}
              techo={techo}
              color="var(--color-chart-1)"
              titulo={`${etiquetaDeCubo(punto.bucket)}: ${formatCOP(punto.expense)} de gasto`}
            />
            {hayIngresos && (
              <Barra
                valor={ingresos[i]}
                techo={techo}
                color="var(--color-chart-2)"
                titulo={`${etiquetaDeCubo(punto.bucket)}: ${formatCOP(punto.income)} de ingreso`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-between text-[11px] text-muted-foreground">
        {puntos.map((punto, i) => (
          <span key={punto.bucket} className="flex-1 text-center">
            {i % cada === 0 ? etiquetaDeCubo(punto.bucket) : ' '}
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

function Barra({
  valor,
  techo,
  color,
  titulo,
}: {
  valor: number;
  techo: number;
  color: string;
  titulo: string;
}) {
  // Mínimo de 2px: un cubo con gasto muy bajo pero NO cero tiene que verse. A
  // 0px sería indistinguible de un mes sin movimientos.
  const alto = valor === 0 ? 0 : Math.max((valor / techo) * 100, 2);

  return (
    <div
      title={titulo}
      className="min-w-0 flex-1 rounded-t-md transition-opacity hover:opacity-80"
      style={{ height: `${alto}%`, backgroundColor: color }}
    />
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block size-2.5 rounded-sm"
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

/** `2025-03` → `mar 25`. `2025-03-14` → `14 mar`. */
export function etiquetaDeCubo(bucket: string): string {
  const [anio, mes, dia] = bucket.split('-');
  const nombre = MESES[Number(mes) - 1] ?? mes;
  return dia ? `${Number(dia)} ${nombre}` : `${nombre} ${anio.slice(2)}`;
}
