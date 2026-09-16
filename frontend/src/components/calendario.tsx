import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { diaLargo, MESES_LARGOS } from '@/lib/fechas';
import { cn } from '@/lib/utils';

/**
 * La semana empieza en LUNES, no en domingo: es como se lee un calendario en
 * Colombia, y el fin de semana queda junto al final de la fila en vez de
 * partido entre las dos puntas.
 */
const DIAS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];

const aISO = (fecha: Date): string => fecha.toISOString().slice(0, 10);
const utc = (anio: number, mes: number, dia: number): Date => new Date(Date.UTC(anio, mes, dia));

/**
 * Las celdas de un mes, alineadas a la rejilla de siete columnas.
 *
 * Los huecos del principio y del final son `null` en vez de días del mes
 * vecino: un día gris que sí se puede pulsar confunde sobre qué mes se está
 * mirando, y uno que no se puede pulsar es ruido.
 */
export function celdasDelMes(anio: number, mes: number): (string | null)[] {
  // getUTCDay() cuenta desde el domingo; con +6 %7 el lunes pasa a ser 0.
  const hueco = (utc(anio, mes, 1).getUTCDay() + 6) % 7;
  const total = utc(anio, mes + 1, 0).getUTCDate();

  const celdas: (string | null)[] = Array.from({ length: hueco }, () => null);
  for (let dia = 1; dia <= total; dia += 1) celdas.push(aISO(utc(anio, mes, dia)));
  while (celdas.length % 7 !== 0) celdas.push(null);

  return celdas;
}

export interface MesVisible {
  anio: number;
  mes: number;
}

export const mesDeISO = (iso: string): MesVisible => ({
  anio: Number(iso.slice(0, 4)),
  mes: Number(iso.slice(5, 7)) - 1,
});

/**
 * La rejilla de un mes.
 *
 * ── Uno solo para los dos usos ──────────────────────────────────────────────
 * El filtro de fechas elige un RANGO y el formulario de un movimiento elige UN
 * día. Es el mismo calendario: cambia cuántos extremos tiene pintados. Escrito
 * dos veces, uno de los dos acabaría empezando la semana en domingo, o
 * marcando hoy de otra forma, y serían dos calendarios distintos dentro de la
 * misma app.
 *
 * `desde` y `hasta` iguales pintan un solo día; distintos, la banda entre los
 * dos. Por eso no hay un modo "rango" y un modo "día": hay dos extremos.
 */
export function Calendario({
  desde,
  hasta,
  vista,
  onVista,
  onDia,
  onSobrevolar,
  className,
}: {
  desde?: string;
  hasta?: string;
  /** El mes que se muestra. Sin esto, el propio calendario lo lleva. */
  vista?: MesVisible;
  onVista?: (mes: MesVisible) => void;
  onDia: (iso: string) => void;
  onSobrevolar?: (iso: string | null) => void;
  className?: string;
}) {
  const [propio, setPropio] = useState<MesVisible>(
    () => mesDeISO(desde ?? hasta ?? aISO(new Date())),
  );
  const actual = vista ?? propio;
  const cambiarVista = onVista ?? setPropio;

  const celdas = celdasDelMes(actual.anio, actual.mes);
  const hoy = aISO(new Date());

  function moverMes(pasos: number): void {
    const d = utc(actual.anio, actual.mes + pasos, 1);
    cambiarVista({ anio: d.getUTCFullYear(), mes: d.getUTCMonth() });
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-2 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => moverMes(-1)}
          aria-label="Mes anterior"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <span aria-live="polite" className="font-display text-sm font-semibold capitalize">
          {MESES_LARGOS[actual.mes]} de {actual.anio}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => moverMes(1)}
          aria-label="Mes siguiente"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-7">
        {DIAS.map((d) => (
          <span
            key={d}
            aria-hidden="true"
            className="grid h-8 place-items-center text-xs font-medium text-muted-foreground"
          >
            {d}
          </span>
        ))}
      </div>

      {/* Sin separación entre celdas: la banda del rango tiene que ser
          continua, y un hueco la partiría en cuadritos sueltos. */}
      <div
        className="grid grid-cols-7"
        onMouseLeave={() => onSobrevolar?.(null)}
      >
        {celdas.map((iso, i) => {
          if (iso === null) return <span key={`hueco-${i}`} className="aspect-square" />;

          const dentro = desde !== undefined && hasta !== undefined && iso >= desde && iso <= hasta;
          const esInicio = iso === desde;
          const esFin = iso === hasta;
          const extremo = esInicio || esFin;

          return (
            <div
              key={iso}
              className={cn(
                // CUADRADA, no de alto fijo: la celda mide lo que mida su
                // columna, y el círculo de dentro mide lo que mida la celda.
                // Con 36px fijos, en un panel estrecho el círculo se salía por
                // los lados de su casilla.
                'aspect-square',
                dentro && !extremo && 'bg-bosque-100 dark:bg-white/12',
                dentro && extremo && desde !== hasta && 'bg-bosque-100 dark:bg-white/12',
                // Las puntas se redondean también al principio y al final de
                // cada fila, o la banda quedaría cortada a ras contra el borde.
                (esInicio || i % 7 === 0) && 'rounded-l-full',
                (esFin || i % 7 === 6) && 'rounded-r-full',
              )}
            >
              <button
                type="button"
                onClick={() => onDia(iso)}
                onMouseEnter={() => onSobrevolar?.(iso)}
                aria-label={diaLargo(iso)}
                aria-pressed={extremo}
                className={cn(
                  'size-full rounded-full text-sm transition-colors',
                  extremo
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : dentro
                      ? 'text-foreground hover:bg-secondary'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  // Hoy lleva anillo, no relleno: el relleno es de lo elegido y
                  // competirían por significar lo mismo.
                  iso === hoy && !extremo && 'font-semibold text-foreground ring-1 ring-inset ring-input',
                )}
              >
                {Number(iso.slice(8))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
