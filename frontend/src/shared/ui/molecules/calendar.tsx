import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { DIAS_DE_LA_SEMANA, diaLargo, MESES_LARGOS } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';

const toIso = (date: Date): string => date.toISOString().slice(0, 10);
const utc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month, day));

/**
 * Las celdas de un mes, alineadas a la rejilla de siete columnas.
 *
 * Los huecos del principio y del final son `null` en vez de días del mes
 * vecino: un día gris que sí se puede pulsar confunde sobre qué mes se está
 * mirando, y uno que no se puede pulsar es ruido.
 */
export function monthCells(year: number, month: number): (string | null)[] {
  // getUTCDay() cuenta desde el domingo; con +6 %7 el lunes pasa a ser 0.
  const blanks = (utc(year, month, 1).getUTCDay() + 6) % 7;
  const total = utc(year, month + 1, 0).getUTCDate();

  const cells: (string | null)[] = Array.from({ length: blanks }, () => null);
  for (let day = 1; day <= total; day += 1) cells.push(toIso(utc(year, month, day)));
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

export interface VisibleMonth {
  year: number;
  month: number;
}

export const monthOfIso = (iso: string): VisibleMonth => ({
  year: Number(iso.slice(0, 4)),
  month: Number(iso.slice(5, 7)) - 1,
});

interface CalendarProps {
  from?: string | undefined;
  to?: string | undefined;
  /** El mes que se muestra. Sin esto, el propio calendario lo lleva. */
  view?: VisibleMonth;
  onViewChange?: (month: VisibleMonth) => void;
  onSelectDay: (iso: string) => void;
  onHover?: (iso: string | null) => void;
  className?: string;
}

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
export function Calendar({
  from,
  to,
  view,
  onViewChange,
  onSelectDay,
  onHover,
  className,
}: CalendarProps) {
  const [ownView, setOwnView] = useState<VisibleMonth>(() =>
    monthOfIso(from ?? to ?? toIso(new Date())),
  );
  const current = view ?? ownView;
  const changeView = onViewChange ?? setOwnView;

  const cells = monthCells(current.year, current.month);
  const today = toIso(new Date());

  function moveMonth(steps: number): void {
    const d = utc(current.year, current.month + steps, 1);
    changeView({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
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
        <MonthHeader current={current} moveMonth={moveMonth} />

        <WeekdayRow />

        <MonthDays
          cells={cells}
          from={from}
          to={to}
          today={today}
          onSelectDay={onSelectDay}
          onHover={onHover}
        />
      </div>
    </div>
  );
}

interface DayCellProps {
  iso: string;
  /** Su posición en la rejilla: decide dónde se curva la banda. */
  i: number;
  from: string | undefined;
  to: string | undefined;
  today: string;
  onSelectDay: (iso: string) => void;
  onHover: ((iso: string | null) => void) | undefined;
}

/** Un día del mes: su banda de rango, su círculo y su número. */
function DayCell({ iso, i, from, to, today, onSelectDay, onHover }: DayCellProps) {
  const isInRange = from !== undefined && to !== undefined && iso >= from && iso <= to;
  const isStart = iso === from;
  const isEnd = iso === to;
  const isEdge = isStart || isEnd;

  return (
    <div
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
        isInRange && !isEdge && 'bg-accent',
        isInRange && isEdge && from !== to && 'bg-accent',
        // Las puntas se redondean también al principio y al final de
        // cada fila, o la banda quedaría cortada a ras contra el borde.
        (isStart || i % 7 === 0) && 'rounded-l-full',
        (isEnd || i % 7 === 6) && 'rounded-r-full',
      )}
    >
      <button
        type="button"
        onClick={() => onSelectDay(iso)}
        onMouseEnter={() => onHover?.(iso)}
        aria-label={diaLargo(iso)}
        aria-pressed={isEdge}
        className={cn(
          'size-full select-none rounded-full text-sm transition-colors',
          isEdge
            ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary/90'
            : isInRange
              ? cn('text-foreground', HIGHLIGHT)
              : cn('text-muted-foreground', HIGHLIGHT),
          // Hoy lleva anillo, no relleno: el relleno es de lo elegido y
          // competirían por significar lo mismo.
          //
          // El anillo va en el acento como TINTA y no en `--input`.
          // `--input` es el borde de un campo, calculado para verse
          // contra un relleno blanco, no para distinguir una casilla de
          // 40px entre otras cuarenta: el círculo de hoy estaba puesto
          // y no se encontraba.
          iso === today &&
            !isEdge &&
            'font-semibold text-foreground ring-1 ring-inset ring-acento-tinta/50',
        )}
      >
        {Number(iso.slice(8))}
      </button>
    </div>
  );
}

/** El mes a la vista, con las dos flechas que lo mueven. */
function MonthHeader({
  current,
  moveMonth,
}: {
  current: VisibleMonth;
  moveMonth: (steps: number) => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <Button
        type="button"
        variant="ghost"
        size="sm-icon"
        onClick={() => moveMonth(-1)}
        aria-label={t('ui.calendar.previousMonth')}
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
        <span className="capitalize">{MESES_LARGOS[current.month]}</span>
        {t('ui.calendar.monthOfYear', { year: current.year })}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm-icon"
        onClick={() => moveMonth(1)}
        aria-label={t('ui.calendar.nextMonth')}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Los días del mes, con los huecos de delante y de detrás. */
function MonthDays({
  cells,
  from,
  to,
  today,
  onSelectDay,
  onHover,
}: Omit<DayCellProps, 'iso' | 'i'> & { cells: (string | null)[] }) {
  // Sin separación entre celdas: la banda del rango tiene que ser continua, y
  // un hueco la partiría en cuadritos sueltos.
  return (
    <div className="grid grid-cols-7" onMouseLeave={() => onHover?.(null)}>
      {cells.map((iso, i) => {
        if (iso === null) {
          // eslint-disable-next-line @eslint-react/no-array-index-key -- los huecos de la rejilla solo tienen su posición
          return <span key={`hueco-${i}`} className="aspect-square" />;
        }

        return (
          <DayCell
            key={iso}
            iso={iso}
            i={i}
            from={from}
            to={to}
            today={today}
            onSelectDay={onSelectDay}
            onHover={onHover}
          />
        );
      })}
    </div>
  );
}

function WeekdayRow() {
  return (
    <div className="grid grid-cols-7">
      {DIAS_DE_LA_SEMANA.map((d) => (
        <span
          key={d}
          aria-hidden="true"
          className="grid h-8 select-none place-items-center text-xs font-medium text-muted-foreground"
        >
          {d}
        </span>
      ))}
    </div>
  );
}
