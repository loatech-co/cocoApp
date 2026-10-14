import { ChevronDown } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/atoms/skeleton';
import { SortButton, type ColumnSort } from '@/shared/ui/atoms/sort-button';

/**
 * A data table, on the phone: one card per row that unfolds in place.
 *
 * ── Why not the table with a horizontal scroll ──────────────────────────────
 * A six-column table at 390px is a window onto two columns that has to be
 * dragged sideways to read a row, and its in-row selectors are 36px targets
 * side by side. What is read from afar on a phone is two facts —what it is
 * and how much—, so a row shows only those two and the rest waits behind a
 * tap.
 *
 * ── Why it still reads as a table ───────────────────────────────────────────
 * Rows stacked in one list, the name on the left and the value on the right,
 * under a slim header with the names of those two columns (which sort, if the
 * table sorts). The value column is right-aligned with tabular figures, and
 * every row keeps the chevron's width at its end, so the amounts line up.
 *
 * It draws what it is given: the consumer says which two columns are the
 * PRIMARY ones and passes the rest as the row's details.
 */
export function ExpandableRows({
  label,
  head,
  foot,
  children,
}: {
  /** The list's name, for whoever cannot see the heading above it. */
  label?: string;
  head?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {head}
      <ul aria-label={label} className="flex flex-col gap-1.5">
        {children}
      </ul>
      {foot}
    </div>
  );
}

/** A column of the header: its name and, if the table sorts by it, how. */
interface HeadColumn {
  label: string;
  sort?: ColumnSort | undefined;
}

/**
 * The header: the names of the two columns a row shows, over them.
 *
 * The 16 on the sides is the row's own inset, and the empty box at the end is
 * the chevron's: without it «Valor» would sit 24px to the right of its
 * figures.
 */
export function ExpandableRowsHead({ primary, value }: { primary: HeadColumn; value: HeadColumn }) {
  return (
    <div className="flex items-center gap-3 px-4 text-xs font-medium text-muted-foreground">
      <HeadLabel column={primary} align="left" className="min-w-0 flex-1" />
      <HeadLabel column={value} align="right" className="shrink-0" />
      <span aria-hidden="true" className="w-4 shrink-0" />
    </div>
  );
}

function HeadLabel({
  column,
  align,
  className,
}: {
  column: HeadColumn;
  align: 'left' | 'right';
  className: string;
}) {
  return (
    <span className={cn('flex', align === 'right' && 'justify-end', className)}>
      {column.sort ? (
        <SortButton sort={column.sort} align={align}>
          {column.label}
        </SortButton>
      ) : (
        <span className="flex min-h-[42px] items-center">{column.label}</span>
      )}
    </span>
  );
}

/**
 * A row: the name and the value, and —open— the rest.
 *
 * The toggle is a real button with `aria-expanded` and `aria-controls`: what
 * a tap on the row did on the desktop (open the record) is an explicit button
 * inside the details now, so no tap does two things.
 */
export function ExpandableRow({
  primary,
  value,
  isOpen,
  onToggle,
  isFlagged = false,
  isDimmed = false,
  surface = 'card',
  children,
}: {
  primary: ReactNode;
  value: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  /**
   * What the row is made of. On the well a row is a `card`; INSIDE a card
   * —the pending payments— a card-colored row would not show, so it is a
   * block (`muted`), as rule 6 says for what sits inside a card.
   */
  surface?: 'card' | 'block';
  /** The row asks for something: an unclassified transaction, for example. */
  isFlagged?: boolean;
  isDimmed?: boolean;
  children: ReactNode;
}) {
  const details = useId();

  return (
    <li
      className={cn(
        'rounded-lg transition-colors',
        surface === 'card' ? 'bg-card' : 'bg-muted',
        // Amber and not red, as on the desktop: unclassified is pending, not
        // an error.
        isFlagged && 'bg-warning-surface/40',
        isDimmed && 'opacity-50',
      )}
    >
      <RowToggle details={details} isOpen={isOpen} onToggle={onToggle}>
        <span className="min-w-0 flex-1">{primary}</span>
        <span className="tabular shrink-0 whitespace-nowrap text-right">{value}</span>
      </RowToggle>

      {isOpen && (
        <div id={details} className="flex flex-col gap-3 border-t border-border px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </li>
  );
}

/** The row's face: what it shows closed, and the chevron that says it opens. */
function RowToggle({
  details,
  isOpen,
  onToggle,
  children,
}: {
  details: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={details}
      onClick={onToggle}
      className="flex min-h-[52px] w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm"
    >
      {children}
      <ChevronDown
        className={cn(
          'size-4 shrink-0 text-muted-foreground transition-transform',
          isOpen && 'rotate-180',
        )}
        aria-hidden="true"
      />
    </button>
  );
}

/** The rest of a row, as label and value: what the desktop shows in columns. */
export function RowFacts({ facts }: { facts: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-sm">
      {facts.map((fact) => (
        <div key={fact.label} className="contents">
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="min-w-0">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The totals, under the rows, aligned like one of them. */
export function ExpandableRowsFoot({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-sm">
      <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
      <span className="tabular shrink-0 whitespace-nowrap text-right">{value}</span>
      <span aria-hidden="true" className="w-4 shrink-0" />
    </div>
  );
}

/**
 * Rows while loading, inside `ExpandableRows`: the same shape, so the list
 * does not jump when it arrives.
 */
export function ExpandableRowsSkeleton({ rows }: { rows: number }) {
  return Array.from({ length: rows }, (_, i) => (
    <li
      key={i}
      aria-hidden="true"
      className="flex min-h-[52px] items-center gap-3 rounded-lg bg-card px-4"
    >
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 w-20" />
    </li>
  ));
}
