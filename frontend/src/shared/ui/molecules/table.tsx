import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

/**
 * The pieces of a data table.
 *
 * ── Why they are loose pieces and not a `<Table columns={…} rows={…} />` ───
 * Because every column in this app does something different: one edits in
 * place, another formats money, another opens a modal. A "generic" table would
 * end up receiving a render function per column, which is exactly writing the
 * cell by hand but with a layer of indirection on top.
 *
 * What is shared is what always goes wrong: the horizontal scroll, the sticky
 * first column and the footer with the totals.
 */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    // No border, like the card and for the same reason: the table is material
    // resting in the well, and the surface step already says where it starts.
    // A line around a table that ALSO carries lines between its rows is two
    // overlapping grids.
    <div className="overflow-x-auto overscroll-x-contain rounded-lg bg-card">
      {/*
        `min-w` forces the scroll instead of squeezing the columns until the
        text breaks into four lines. With the first column sticky, it is
        dragged sideways without losing sight of which row each number is in.
      */}
      <table className={cn('w-full min-w-[48rem] border-collapse text-sm', className)}>
        {children}
      </table>
    </div>
  );
}

/**
 * A column header.
 *
 * When it sorts, the arrow is ALWAYS visible even when off: if it only showed
 * on the active column, there would be no way to know that the others can be
 * sorted too without trying them one by one.
 */
export function Th({
  children,
  align = 'left',
  isSticky = false,
  hasDivider = true,
  sort,
  className,
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  /** The first column, the one that does not go away on scroll. */
  isSticky?: boolean;
  /**
   * The line that separates the sticky column from the ones that scroll.
   *
   * It helps when there are so many columns that one loses track of which row
   * one is reading. With six columns that almost fit whole, it is one line too
   * many.
   */
  hasDivider?: boolean;
  sort?: { direction: 'asc' | 'desc' | null; onChange: () => void } | undefined;
  className?: string;
}) {
  const content = sort ? (
    <SortButton sort={sort} align={align}>
      {children}
    </SortButton>
  ) : (
    children
  );

  return (
    <th
      scope="col"
      aria-sort={
        sort?.direction === 'asc'
          ? 'ascending'
          : sort?.direction === 'desc'
            ? 'descending'
            : undefined
      }
      className={cn(
        'whitespace-nowrap border-b border-border px-4 py-3 text-xs font-semibold text-muted-foreground',
        align === 'right' ? 'text-right' : 'text-left',
        isSticky && 'sticky left-0 z-10 bg-card',
        isSticky && hasDivider && 'border-r',
        className,
      )}
    >
      {content}
    </th>
  );
}

export function Tr({
  children,
  onClick,
  isFlagged = false,
  isDimmed = false,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** The row asks for something: an unclassified transaction, for example. */
  isFlagged?: boolean;
  isDimmed?: boolean;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        // `group/fila` lets the STICKY cell know that its row is under the
        // cursor: that cell needs its own opaque background so the columns do
        // not show through when scrolling, and that opaque background covered
        // the row's highlight. Everything was marked except the first column.
        'group/fila border-b border-border transition-colors last:border-b-0',
        // Amber and not red: unclassified is not an error, it is something
        // pending. In this palette red is reserved for what really went wrong.
        isFlagged ? 'bg-warning-surface/40 hover:bg-warning-surface/60' : 'hover:bg-muted/60',
        isDimmed && 'opacity-50',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Td({
  children = null,
  align = 'left',
  isSticky = false,
  hasDivider = true,
  isFlagged = false,
  className,
}: {
  children?: ReactNode;
  align?: 'left' | 'right';
  isSticky?: boolean;
  /** See `Th`. */
  hasDivider?: boolean;
  /** Inherits the row's tint: a sticky cell on its own background would cover it. */
  isFlagged?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        'px-4 py-3',
        align === 'right' ? 'text-right' : 'text-left',
        // The sticky cell needs its OWN opaque background, or the columns
        // behind would show through underneath when scrolling. Since it is
        // opaque, it has to repeat its row's highlight by hand: `color-mix`
        // reproduces exactly what the browser composites in the other cells.
        isSticky && 'sticky left-0 z-10 transition-colors',
        isSticky && hasDivider && 'border-r border-border',
        isSticky &&
          (isFlagged
            ? 'bg-[color-mix(in_srgb,var(--warning-surface)_40%,var(--card))] group-hover/fila:bg-[color-mix(in_srgb,var(--warning-surface)_60%,var(--card))]'
            : 'bg-card group-hover/fila:bg-[color-mix(in_srgb,var(--muted)_60%,var(--card))]'),
        className,
      )}
    >
      {children}
    </td>
  );
}

/**
 * The footer with the totals.
 *
 * It goes inside the table and not below it on purpose: that way it scrolls
 * with the columns and each total sits under its own. A footer outside the
 * table forces repeating the widths by hand and falls out of alignment at the
 * first change.
 */
export function TableFooter({ children }: { children: ReactNode }) {
  return <tfoot className="border-t-2 border-border bg-muted/40 font-medium">{children}</tfoot>;
}

/**
 * The table while its data arrives.
 *
 * With the SAME number of columns and the same row height as the real one: a
 * skeleton of another shape is a page change, not a wait, and the view jumps
 * when the data arrives.
 */
export function TableSkeleton({
  columns,
  rows = 8,
  hasDivider = true,
}: {
  columns: string[];
  rows?: number;
  hasDivider?: boolean;
}) {
  return (
    <Table>
      <thead>
        <tr>
          {columns.map((name, i) => (
            <Th
              key={name}
              isSticky={i === 0}
              hasDivider={hasDivider}
              align={i === columns.length - 1 ? 'right' : 'left'}
            >
              {name}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, row) => (
          <tr key={row} className="border-b border-border last:border-b-0">
            {columns.map((name, i) => (
              <Td key={name} isSticky={i === 0} hasDivider={hasDivider}>
                <Skeleton className={cn('h-4', i === 0 ? 'w-40' : 'w-20')} />
              </Td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
/** The button that sorts a column, with its arrow always visible. */
function SortButton({
  sort,
  align,
  children,
}: {
  sort: { direction: 'asc' | 'desc' | null; onChange: () => void };
  align: 'left' | 'right';
  children: ReactNode;
}) {
  const Arrow =
    sort.direction === 'asc' ? ChevronUp : sort.direction === 'desc' ? ChevronDown : ChevronsUpDown;

  return (
    <button
      type="button"
      onClick={sort.onChange}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground',
        align === 'right' && 'flex-row-reverse',
        sort.direction && 'text-foreground',
      )}
    >
      {children}
      <Arrow
        className={cn('size-3.5 shrink-0', !sort.direction && 'opacity-40')}
        aria-hidden="true"
      />
    </button>
  );
}
