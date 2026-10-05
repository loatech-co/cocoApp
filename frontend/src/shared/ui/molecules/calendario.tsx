import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { diaLargo, MESES_LARGOS } from '@/shared/lib/fechas';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';
import { REALCE } from '@/shared/ui/foundations/superficie';

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
  desde?: string | undefined;
  hasta?: string | undefined;
  /** El mes que se muestra. Sin esto, el propio calendario lo lleva. */
  vista?: MesVisible;
  onVista?: (mes: MesVisible) => void;
  onDia: (iso: string) => void;
  onSobrevolar?: (iso: string | null) => void;
  className?: string;
}) {
  const [propio, setPropio] = useState<MesVisible>(() =>
    mesDeISO(desde ?? hasta ?? aISO(new Date())),
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
      {/*
        ── El mes mide 294px, y va en su PROPIA caja ────────────────────────
        Siete columnas de 42, que es el suelo de lo que se toca en esta app
        —el mismo que usan la barra del teléfono y sus campos—. La casilla es
        cuadrada, así que de ahí salen los 42x42 de cada día.

        La medida va en el CONJUNTO y no en la casilla. Puesta en la casilla,
        la celda se quedaría corta dentro de su columna y entre una y otra
        habría un hueco: la banda del rango se partiría en cuadritos sueltos.
        Así las columnas siguen tocándose y lo que mide 294 es el mes entero.

        ── Por qué un ANCHO y no un tope ────────────────────────────────────
        Con `max-w` no salían 42. Un tope solo recorta lo que sobra, y aquí no
        sobraba nada: el panel que envuelve a esto se ajusta a su contenido
        —`w-auto`—, así que su ancho lo pide el contenido, y lo que pide una
        rejilla de columnas automáticas es lo que ocupa el número más ancho.
        El mes salía de unos 140px y el tope de 294 no llegaba a tocarse
        nunca. Pidiendo el ancho, el panel se ajusta A ÉL.

        `max-w-full` es la salida para una pantalla más angosta que 294: ahí
        las columnas se encogen por igual, que es mejor que salirse.

        ── Y por qué en una caja propia ─────────────────────────────────────
        Porque la de fuera es la que recibe el relleno del que llama —`p-3` en
        el selector de rango— y con `border-box` esos 24px se descontarían de
        los 294: la columna caía a 38,6. Aquí la medida no comparte caja con
        ningún relleno.
      */}
      <div className="mx-auto w-[294px] max-w-full">
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm-icon"
            onClick={() => moverMes(-1)}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          {/*
            La mayúscula va SOLO en el mes.

            Estaba `capitalize` en toda la frase, y eso pone en mayúscula la
            primera letra de CADA palabra: «septiembre de 2026» salía
            «Septiembre De 2026». El «de» es una preposición, no una palabra que
            se titule.

            Y no vale `first-letter:uppercase` en el conjunto: `::first-letter`
            solo se aplica a contenedores de bloque, y esto es un `span` en
            línea, así que la regla no engancharía y el mes saldría en
            minúscula. Envolver la palabra que sí se titula es explícito y no
            depende de ninguna excepción del selector.
          */}
          <span aria-live="polite" className="font-display text-sm font-semibold">
            <span className="capitalize">{MESES_LARGOS[actual.mes]}</span> de {actual.anio}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm-icon"
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
              className="grid h-8 select-none place-items-center text-xs font-medium text-muted-foreground"
            >
              {d}
            </span>
          ))}
        </div>

        {/* Sin separación entre celdas: la banda del rango tiene que ser
            continua, y un hueco la partiría en cuadritos sueltos. */}
        <div className="grid grid-cols-7" onMouseLeave={() => onSobrevolar?.(null)}>
          {celdas.map((iso, i) => {
            if (iso === null) {
              // eslint-disable-next-line @eslint-react/no-array-index-key -- los huecos de la rejilla solo tienen su posición
              return <span key={`hueco-${i}`} className="aspect-square" />;
            }

            const dentro =
              desde !== undefined && hasta !== undefined && iso >= desde && iso <= hasta;
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
                  // La banda del rango es `--accent`, el token del tema para lo
                  // que está señalado. Llevaba además un `dark:bg-white/12`
                  // encima: un blanco inventado que no sale de ningún token y
                  // que en oscuro pintaba la banda de gris en vez de teal.
                  dentro && !extremo && 'bg-accent',
                  dentro && extremo && desde !== hasta && 'bg-accent',
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
                    'size-full select-none rounded-full text-sm transition-colors',
                    extremo
                      ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary/90'
                      : dentro
                        ? cn('text-foreground', REALCE)
                        : cn('text-muted-foreground', REALCE),
                    // Hoy lleva anillo, no relleno: el relleno es de lo elegido y
                    // competirían por significar lo mismo.
                    //
                    // El anillo va en el acento como TINTA y no en `--input`.
                    // `--input` es el borde de un campo, calculado para verse
                    // contra un relleno blanco, no para distinguir una casilla de
                    // 40px entre otras cuarenta: el círculo de hoy estaba puesto
                    // y no se encontraba.
                    iso === hoy &&
                      !extremo &&
                      'font-semibold text-foreground ring-1 ring-inset ring-acento-tinta/50',
                  )}
                >
                  {Number(iso.slice(8))}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
