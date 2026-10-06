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
 * The cells of a month, aligned to the seven-column grid.
 *
 * The gaps at the start and at the end are `null` instead of days of the
 * neighboring month: a gray day that can be pressed confuses which month is
 * being looked at, and one that cannot be pressed is noise.
 */
export function monthCells(year: number, month: number): (string | null)[] {
  // getUTCDay() counts from Sunday; with +6 %7 Monday becomes 0.
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
  /** The month shown. Without this, the calendar keeps track of it itself. */
  view?: VisibleMonth;
  onViewChange?: (month: VisibleMonth) => void;
  onSelectDay: (iso: string) => void;
  onHover?: (iso: string | null) => void;
  className?: string;
}

/**
 * The grid of a month.
 *
 * ── A single one for both uses ──────────────────────────────────────────────
 * The date filter picks a RANGE and a transaction's form picks ONE day. It is
 * the same calendar: what changes is how many ends it has painted. Written
 * twice, one of the two would end up starting the week on Sunday, or marking
 * today some other way, and they would be two different calendars inside the
 * same app.
 *
 * Equal `from` and `to` paint a single day; different, the band between the
 * two. That is why there is no "range" mode and "day" mode: there are two
 * ends.
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
        ── The month measures 294px, and goes in its OWN box ────────────────
        Seven columns of 42, which is the floor for what is touched in this
        app —the same one the phone bar and its fields use—. The cell is
        square, so that is where the 42x42 of each day comes from.

        The measurement goes on the WHOLE and not on the cell. Put on the
        cell, the cell would fall short inside its column and there would be
        a gap between one and the next: the range band would break into loose
        little squares. This way the columns keep touching and what measures
        294 is the whole month.

        ── Why a WIDTH and not a cap ────────────────────────────────────────
        With `max-w` it did not come out at 42. A cap only trims the excess,
        and here there was no excess: the panel wrapping this fits its content
        —`w-auto`—, so its width is asked for by the content, and what a grid
        of auto columns asks for is what the widest number takes. The month
        came out at about 140px and the 294 cap was never reached. Asking for
        the width, the panel fits TO IT.

        `max-w-full` is the way out for a screen narrower than 294: there the
        columns shrink evenly, which is better than running off.

        ── And why in its own box ───────────────────────────────────────────
        Because the outer one is the one that receives the caller's padding
        —`p-3` in the range picker— and with `border-box` those 24px would be
        taken off the 294: the column dropped to 38.6. Here the measurement
        shares its box with no padding.
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
  /** Its position in the grid: decides where the band curves. */
  i: number;
  from: string | undefined;
  to: string | undefined;
  today: string;
  onSelectDay: (iso: string) => void;
  onHover: ((iso: string | null) => void) | undefined;
}

/** A day of the month: its range band, its circle and its number. */
function DayCell({ iso, i, from, to, today, onSelectDay, onHover }: DayCellProps) {
  const isInRange = from !== undefined && to !== undefined && iso >= from && iso <= to;
  const isStart = iso === from;
  const isEnd = iso === to;
  const isEdge = isStart || isEnd;

  return (
    <div
      className={cn(
        // SQUARE, not fixed height: the cell measures whatever its
        // column measures, and the circle inside measures whatever the
        // cell measures. With a fixed 36px, in a narrow panel the circle
        // stuck out the sides of its cell.
        'aspect-square',
        // The range band is `--accent`, the theme's token for what is
        // pointed at. It also carried a `dark:bg-white/12` on top: a
        // made-up white that comes from no token and that in dark
        // painted the band gray instead of teal.
        isInRange && !isEdge && 'bg-accent',
        isInRange && isEdge && from !== to && 'bg-accent',
        // The ends are also rounded at the start and at the end of each
        // row, or the band would be cut flush against the edge.
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
          // Today carries a ring, not a fill: the fill belongs to the
          // selected and they would compete to mean the same thing.
          //
          // The ring is in the accent as INK and not in `--input`.
          // `--input` is a field's border, computed to show against a
          // white fill, not to tell one 40px cell apart from forty
          // others: today's circle was there and could not be found.
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

/** The month in view, with the two arrows that move it. */
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
        The capital goes ONLY on the month.

        There was `capitalize` on the whole phrase, and that capitalizes the
        first letter of EVERY word: «septiembre de 2026» came out
        «Septiembre De 2026». The «de» is a preposition, not a word that
        gets title case.

        And `first-letter:uppercase` on the whole does not work:
        `::first-letter` only applies to block containers, and this is an
        inline `span`, so the rule would not catch and the month would come
        out in lowercase. Wrapping the word that does get title case is
        explicit and depends on no exception of the selector.
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

/** The days of the month, with the gaps before and after. */
function MonthDays({
  cells,
  from,
  to,
  today,
  onSelectDay,
  onHover,
}: Omit<DayCellProps, 'iso' | 'i'> & { cells: (string | null)[] }) {
  // No spacing between cells: the range band has to be continuous, and a gap
  // would break it into loose little squares.
  return (
    <div className="grid grid-cols-7" onMouseLeave={() => onHover?.(null)}>
      {cells.map((iso, i) => {
        if (iso === null) {
          // eslint-disable-next-line @eslint-react/no-array-index-key -- the grid's gaps only have their position
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
