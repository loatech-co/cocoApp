import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The title of a screen, its line of explanation and what can be done.
 *
 * ── Why it is a component ───────────────────────────────────────────────────
 * Because eight screens wrote it by hand and had already split into THREE
 * different typographies: the dashboard and the transactions in `text-2xl sm:text-3xl`
 * with the heading family, five screens in plain `text-3xl` with the
 * body family, and the cost centers in `text-3xl sm:text-4xl`. Nobody
 * decided it; it was written eight times and three came out.
 *
 * And it shows when navigating, which is the worst part: the title changes size when going from
 * one screen to another, so the application looks like three applications.
 *
 * ── Why it grows with the screen ────────────────────────────────────────────
 * 24px on a phone and 30 from a tablet up. With a fixed 30, "Importar
 * movimientos" took two lines on a phone and pushed the content
 * below the fold.
 *
 * ── Why it has no letter spacing ────────────────────────────────────────────
 * The theme declares it as zero and Geist already comes tight on its own; the
 * `tracking-tight` that three of the eight carried compensated for a looser
 * family, and applied to this one it crams the titles.
 *
 * ── Why the rule belongs to the component ───────────────────────────────────
 * Because TWO of the eight screens had it —the ones that go through the filter
 * bar, which wrote it in its own call— and the other six did not. When
 * navigating, the title gained and lost a line underneath depending on where one
 * came in from. The rule separates the title from the content, and that is needed in all
 * eight or in none.
 *
 * ── And the action goes in `sm` ─────────────────────────────────────────────
 * The 36px, not the 44. It is not a preference: in the filter bar the primary
 * action lives alongside the search, the sort, the filter and the range, and there it is
 * already decided that all the controls in the row measure the same —breaking it
 * left the row misaligned, and it is written in its code—. If the
 * Cost centers button measures 44 and the dashboard one 36, the same action changes
 * size when changing screens.
 */
/**
 * The typography of a screen title, for what is not a header.
 *
 * The 404 uses it, which has no description nor actions nor content to separate: it is a
 * centered title on an empty screen. It was written by hand —plain `text-3xl`,
 * without the heading family and without growing with the screen— and it was the ninth
 * screen with its own title typography right after unifying the
 * first eight.
 */
export const PAGE_TITLE = 'font-display text-2xl font-semibold leading-tight sm:text-3xl';

export function PageHeader({
  title,
  description,
  beside,
  actions,
  align = 'top',
  className,
}: {
  title: string;
  /** What this screen is, or what is being viewed. One line. */
  description?: ReactNode;
  /** Sits right next to the title: a help button, a status tag. */
  beside?: ReactNode;
  /** What can be done here, at the end opposite the title. */
  actions?: ReactNode;
  /**
   * `bottom` aligns the actions with the baseline of the title instead of with
   * its top. It is what a filter bar wants, where what is on the
   * right are controls of the same height and not a lone button.
   */
  align?: 'top' | 'bottom';
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap justify-between gap-x-4 gap-y-3',
        align === 'bottom' ? 'items-end' : 'items-start',
        'border-b border-border pb-4',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className={PAGE_TITLE}>{title}</h1>
          {beside}
        </div>
        {Boolean(description) && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {actions}
    </header>
  );
}
