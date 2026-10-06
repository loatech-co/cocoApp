import { ChevronLeft, ChevronRight } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { REALCE } from '@/shared/ui/foundations/superficie';

/*
 * Moving through a tree of levels —centers, categories, concepts— inside
 * a list: drilling into what is inside a row and going back to the one above.
 */

/**
 * The way back to the level above: a chevron and the levels walked.
 *
 * Going down a level is one click; going up has to be one too. The dashboard
 * donut and the classification filter use it. `isStrong` is the filter's weight,
 * where the path acts as the dropdown's title.
 */
export function BackCrumb({
  path,
  isStrong = false,
  onBack,
}: {
  path: readonly string[];
  isStrong?: boolean;
  onBack: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onBack}
      className={cn(
        'flex min-w-0 items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground',
        isStrong && 'font-semibold',
      )}
    >
      <ChevronLeft className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{path.join(' · ')}</span>
    </button>
  );
}

/**
 * Drilling into what is inside a row: the chevron on the right.
 *
 * It takes the FULL height of the row and 36 of width, because the row is already another
 * control —checking— and this is a second door on the same line.
 */
export function DrillButton({ name, onDrill }: { name: string; onDrill: () => void }) {
  return (
    <button
      type="button"
      onClick={onDrill}
      aria-label={t('ui.levelNav.open', { name })}
      title={t('ui.levelNav.open', { name })}
      className={cn(
        'grid w-9 shrink-0 place-items-center text-muted-foreground transition-colors',
        REALCE,
      )}
    >
      <ChevronRight className="size-4" aria-hidden="true" />
    </button>
  );
}
