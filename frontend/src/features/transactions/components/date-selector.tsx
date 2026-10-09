import { CalendarDays } from 'lucide-react';
import { useState } from 'react';

import { PRESETS, type Filters } from '@/features/transactions/model/filters';
import { longDay, longRange } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';
import { findDate } from '@/shared/lib/read-date';
import { cn } from '@/shared/lib/utils';
import { fieldTrigger, useInsideField } from '@/shared/ui/foundations/field';
import { Calendar } from '@/shared/ui/molecules/calendar';
import { Menu } from '@/shared/ui/molecules/menu';

import { RangePanel } from './range-panel';

/**
 * THE date selector. Just one, with or without a range and with or without shortcuts.
 *
 * ── Why one and not two ─────────────────────────────────────────────────────
 * There were two components —one for a day, another for a range— and of the six
 * decisions a date selector makes they shared five: what opens the
 * panel, how it closes, where it is placed, which calendar goes inside and how
 * big it is. The only thing of their own was how many ends get picked.
 *
 * Two copies start out the same and drift apart, and here it had already begun: the
 * one-day one hung from `Menu` —which knows how to place itself against the window, close
 * on an outside tap and on Escape— and the range one carried thirty lines of that same
 * machinery written by hand, with its own `useEffect` and its panel in absolute.
 * Fixing the clipping inside a modal in one did not fix the other.
 *
 * ── Why not `<input type="date">` ───────────────────────────────────────────
 * Because the one that opens is the OPERATING SYSTEM's: its typeface, its colors,
 * its language and its week starting on Sunday. In the middle of a green form
 * a gray Windows or macOS box shows up, and the same form looks
 * different on every machine.
 *
 * ── The three shapes it takes ───────────────────────────────────────────────
 *
 * | Call | What comes out |
 * |---|---|
 * | without `isRange` | A form field that opens a month |
 * | `isRange` | A bar control that picks two ends |
 * | `isRange hasShortcuts` | The above with the column of periods on the left |
 */

interface CommonProps {
  id?: string;
}

interface DayProps extends CommonProps {
  isRange?: false;
  /** It is drawn the same but opens nothing: it is a fact to read, not to pick. */
  disabled?: boolean;
  /** `YYYY-MM-DD`. */
  value: string;
  onSelect: (iso: string) => void;
  required?: boolean;
}

interface RangeProps extends CommonProps {
  isRange: true;
  filters: Filters;
  apply: (changes: Partial<Filters>) => void;
  /** The column of ready-made periods: «Este mes», «Últimos 90 días»… */
  hasShortcuts?: boolean;
  /**
   * How whoever places it shares out the width.
   *
   * It is the ONLY control in the filter bar whose label is a fact —the
   * chosen range, in full— so it is the one that has to keep the space
   * left over once the others have measured theirs.
   */
  boxClassName?: string;
}

export function DateSelector(props: DayProps | RangeProps) {
  return props.isRange ? <RangePicker {...props} /> : <DayPicker {...props} />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ONE DAY — a form field
   ═══════════════════════════════════════════════════════════════════════════ */

function DayPicker({ id, value, onSelect, required: isRequired, disabled: isDisabled }: DayProps) {
  const isInField = useInsideField();

  const { typed, setTyped, confirm } = useTypedDate(value, onSelect);

  /*
    The value also travels in a hidden input so that the form sends it in
    ISO and not as it was typed: a button is not a field, and what shows here is
    «19 de septiembre de 2026».
  */
  const hidden = <input type="hidden" name={id} value={value} />;

  if (isDisabled) {
    // Disabled is neither a field to type in nor a button that opens anything: it
    // is drawn the same but with nothing behind it, so that focus does not fall into a
    // trap.
    return (
      <>
        {hidden}
        <DisabledDay value={value} isInField={isInField} />
      </>
    );
  }

  return (
    <>
      {hidden}
      {/* Focus is painted on the BOX and not on the input inside: what looks
          like a control is the box, and a ring around the text would leave
          the icon outside what is focused. */}
      <div
        className={cn(
          fieldTrigger(),
          'focus-within:border-ring/60 focus-within:ring-1 focus-within:ring-ring/20',
        )}
      >
        <input
          id={id}
          type="text"
          value={typed}
          required={isRequired === true}
          // The placeholder is an EXAMPLE of what can be typed, not an
          // instruction: it shows the format without spending a line of help. And
          // it is needed so the floating label knows when to rise.
          placeholder={t('transactions.range.datePlaceholder')}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={confirm}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            // Without this, Enter submits the form with what has not been
            // interpreted yet.
            e.preventDefault();
            confirm();
          }}
          className={cn(
            'min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground',
            isInField && 'pt-4',
          )}
        />

        <DayCalendar value={value} onSelect={onSelect} />
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   A RANGE — a bar control
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ── Why the shortcuts and the calendar go together ──────────────────────────
 * They are not two different controls, they are two ways of saying the same thing: "the
 * current month" and "from the 1st to the 15th of September" produce the same cut. Splitting them
 * would force looking for which place holds the one you need.
 */
function RangePicker({ filters, apply, hasShortcuts = false, boxClassName }: RangeProps) {
  const activeIndex = PRESETS.find((p) => p.value === filters.preset);
  const label =
    filters.preset === 'todo'
      ? t('transactions.range.allTime')
      : filters.preset === 'personalizado'
        ? longRange(filters.from, filters.to)
        : (activeIndex?.label ?? t('transactions.range.range'));

  return (
    <Menu
      kind="panel"
      // Anchored to the RIGHT: the control lives at the end of a bar aligned to
      // the right, and opening toward the left a wide panel runs off the
      // screen.
      align="right"
      isFloating
      hasOwnWidth
      isUnpadded
      /*
        ── The width is set by what is inside ────────────────────────────────
        It was a fixed 34rem, and since the calendar has a cap —seven columns
        of 42— it was too much: the month floated in the middle of the panel with a
        hand's width of empty space on each side.

        On a wide screen the panel is a row —shortcuts on the left, month on the
        right— and both pieces already know their size, so `w-auto` gives
        exactly that and not a pixel more.

        On the phone that does not work: there the shortcuts become chips that flow, and
        a box that fits its content would put them all on one line
        without letting them wrap. That is why below the breakpoint a size rules, which
        is the calendar's plus its padding.
      */
      width="calendar"
      /*
        The trigger is NOT written here: it is the one `Menu` provides by default
        —icon, label that truncates and arrow that turns on opening— with the
        toolbar variant. Writing it by hand was repeating that
        button for the third time in the project, and it also forced putting the
        height and the radius in the call, which is exactly what rule 2 does not
        allow: those sizes live in `size`.

        The label states the chosen range, so it acts as the accessible name
        of the control: whoever cannot see the screen hears which cut is set, which
        is better than hearing "elegir rango".
      */
      label={label}
      Icon={CalendarDays}
      variant="tool"
      // The label is the whole range and has to be able to shrink: it is the
      // only custom width in the whole bar.
      boxClassName={cn('max-w-full', boxClassName)}
    >
      {(close) => (
        <RangePanel filters={filters} apply={apply} hasShortcuts={hasShortcuts} close={close} />
      )}
    </Menu>
  );
}

/*
  The calendar is no longer the whole field: it is the only thing that opens it. It goes where
  things that open something go —on the right, like a dropdown's arrow— and it does not turn,
  because an upside-down calendar says nothing.
*/
function DayCalendar({ value, onSelect }: { value: string; onSelect: (iso: string) => void }) {
  return (
    <Menu
      label={t('transactions.range.openCalendar')}
      Icon={CalendarDays}
      isIconOnly
      variant="ghost"
      kind="panel"
      align="right"
      isFloating
      hasOwnWidth
      // The calendar brings its own padding: with the menu's on top it ends up
      // doubled on all four sides.
      isUnpadded
      width="content"
      boxClassName="shrink-0"
    >
      {(close) => (
        <Calendar
          className="p-3"
          from={value || undefined}
          to={value || undefined}
          onSelectDay={(iso) => {
            onSelect(iso);
            // A single day needs no confirming: with the second click there is
            // nothing left to decide.
            close();
          }}
        />
      )}
    </Menu>
  );
}

function DisabledDay({ value, isInField }: { value: string; isInField: boolean }) {
  return (
    <span aria-disabled="true" className={cn(fieldTrigger(), 'opacity-50')}>
      <span className={cn('min-w-0 flex-1 truncate', isInField && 'pt-4')}>
        {value ? longDay(value) : t('transactions.range.chooseDate')}
      </span>
      <CalendarDays className="size-4 shrink-0 opacity-70" aria-hidden="true" />
    </span>
  );
}

/** What is typed in the field, and how it becomes a date. */
function useTypedDate(value: string, onSelect: (iso: string) => void) {
  /*
    ── The field is TYPED, and the calendar is the other door ────────────────
    It was a button: the only way to set a date was opening the month and looking for
    the day. For «hoy» or «ayer» that is fine; for March 3 of last year
    it is four arrow clicks before you even start looking. Whoever has the receipt
    in front of them already knows the date and the fastest thing is to type it.

    So here it is typed, and what is typed is understood: `19 de septiembre 2026`,
    `sep 10 2026`, `10/09/2026`, `2026-09-10`. `shared/lib/read-date` does it, which is
    the same one that reads the dates of an imported statement —a second
    parser would end up understanding different things depending on where you type—.

    And on leaving the field it is NORMALIZED to the form in which this app writes a
    date, so that two transactions recorded on the same day do not read
    differently depending on how each person typed them.
  */
  const [typed, setTyped] = useState(() => (value ? longDay(value) : ''));

  // The field follows the value when someone else changes it: the calendar, or opening the
  // sheet of another transaction without unmounting this.
  useOnChange([value], () => {
    setTyped(value ? longDay(value) : '');
  });

  /*
    What is typed is confirmed on leaving the field or with Enter, not on every key:
    «1» is a valid date while someone types «19 de septiembre», and
    rewriting the field under the fingers is what makes a date field
    unpredictable.

    If it is not understood, it goes back to the last valid value instead of staying half done.
    The value saved is always a real date, and what could not be
    read cannot look as if it could.
  */
  function confirm(): void {
    const text = typed.trim();

    if (text === '') {
      setTyped(value ? longDay(value) : '');
      return;
    }

    const parsed = findDate(text, new Date().getFullYear());
    if (!parsed) {
      setTyped(value ? longDay(value) : '');
      return;
    }

    // If it does not change, the effect does not fire and it has to normalize here: whoever
    // types «10/09/2026» over that same date has to see how it ends up.
    if (parsed.iso === value) setTyped(longDay(parsed.iso));
    else onSelect(parsed.iso);
  }

  return { typed, setTyped, confirm };
}
