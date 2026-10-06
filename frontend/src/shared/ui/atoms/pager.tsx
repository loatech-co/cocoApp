import { ArrowLeft, ArrowRight } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';

/**
 * Pager. A single one for the whole app.
 *
 * It exists as a component and not loose in each screen because the edge
 * rules —disable at the ends, do not show with a single page,
 * which numbers fit— are forgotten half the time if they have to be rewritten.
 *
 * ── Why the numbers and not just "previous / next" ─────────────────────────
 * Because with eight pages one wants to jump to five, not click three times.
 * And because the highlighted number says where one is without having to read a
 * separate counter.
 *
 * ── Why it is a joined group and not loose buttons ──────────────────────────
 * A single border around everything presents it as ONE control: loose
 * buttons with space between them read as different actions, and "3" is not
 * a different action from "4".
 */
export function Pager({
  page,
  total,
  perPage,
  onPageChange,
  className,
}: {
  page: number;
  /** Total ROWS, not pages: it is what the API returns. */
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));

  // With a single page there is nothing to paginate, and showing two dead buttons
  // only adds noise.
  if (pages <= 1) return null;

  return (
    <nav className={cn('flex justify-center', className)} aria-label={t('common.pagination')}>
      {/*
        No fill of its own: the pager rests on the page background
        instead of floating over it. With `bg-card` it read as one more card —the
        same color as the ones with content— and competed for attention with
        the table that has just been read.

        The frame stays, thin and faint, because it is what presents it as ONE
        control and not as seven loose buttons.
      */}
      <ul className="inline-flex items-stretch divide-x divide-border/70 overflow-hidden rounded-lg border border-border/70">
        <li>
          <Cell
            isDisabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={t('common.previousPage')}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('common.previous')}</span>
          </Cell>
        </li>

        <PageNumbers page={page} pages={pages} onPageChange={onPageChange} />

        <li>
          <Cell
            isDisabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
            aria-label={t('common.nextPage')}
          >
            <span className="hidden sm:inline">{t('common.next')}</span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </Cell>
        </li>
      </ul>
    </nav>
  );
}

function Cell({
  children,
  isCurrent = false,
  isDisabled = false,
  onClick,
  ...props
}: {
  children: React.ReactNode;
  isCurrent?: boolean;
  isDisabled?: boolean;
  onClick: () => void;
} & React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      className={cn(
        'flex h-9 items-center justify-center gap-2 px-3 text-sm font-medium transition-colors',
        isCurrent
          ? 'bg-muted/70 text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        isDisabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Which numbers are drawn. `null` is a gap (…).
 *
 * With fifty pages fifty buttons do not fit, so the
 * ends, the current one and its neighbors are shown. The ends always: they are the two jumps
 * one wants to make —to the start and to the end— and without them one has to click
 * "next" forty times.
 */
export function visiblePageNumbers(page: number, pages: number, gap = 1): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

  const near = new Set<number>([1, pages, page]);
  for (let d = 1; d <= gap; d += 1) {
    if (page - d > 1) near.add(page - d);
    if (page + d < pages) near.add(page + d);
  }

  const order = [...near].sort((a, b) => a - b);
  const result: (number | null)[] = [];

  let previous: number | undefined;
  for (const isCurrent of order) {
    // A gap of ONE number is not drawn with dots: "1 … 3" takes the same room
    // as "1 2 3" and hides a page for nothing.
    if (previous !== undefined && isCurrent - previous > 1) {
      result.push(isCurrent - previous === 2 ? isCurrent - 1 : null);
    }
    result.push(isCurrent);
    previous = isCurrent;
  }

  return result;
}

/** The page numbers, with their gaps. */
function PageNumbers({
  page,
  pages,
  onPageChange,
}: {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <>
      {visiblePageNumbers(page, pages).map((n, i) =>
        n === null ? (
          // eslint-disable-next-line @eslint-react/no-array-index-key -- a «…» gap has no identity beyond its position
          <li key={`salto-${i}`}>
            <span className="grid h-9 w-9 place-items-center text-sm text-muted-foreground">…</span>
          </li>
        ) : (
          <li key={n}>
            <Cell
              isCurrent={n === page}
              onClick={() => onPageChange(n)}
              aria-label={t('common.pageN', { n })}
              aria-current={n === page ? 'page' : undefined}
            >
              <span className="tabular w-4 text-center">{n}</span>
            </Cell>
          </li>
        ),
      )}
    </>
  );
}
