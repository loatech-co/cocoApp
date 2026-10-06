import type { ComponentType } from 'react';

import { cn } from '@/shared/lib/utils';
import { Tag } from '@/shared/ui/atoms/badge';
import { IconChip, type ChipColor } from '@/shared/ui/atoms/icon-chip';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';

/**
 * A menu option with its color swatch and a description line below. Today,
 * the two ways of starting a transaction: expense or income.
 *
 * ── Why they are not two rows of text ───────────────────────────────────────
 * Because this is the interaction repeated every day, and in it the first
 * decision —expense or income— is not a setting: it is what is going to be
 * talked about. Two identical lines force reading to tell them apart; with
 * the swatch in the color that already means that in the summary —violet for
 * what goes out, green for what comes in— the choice is made by looking, which
 * is what one wants to do twenty times a week.
 *
 * The second line exists for the same reason. "Gasto" and "Ingreso" get mixed
 * up when reading fast —they start differently but look alike in shape— and
 * "plata que sale" versus "plata que entra" never get mixed up.
 */
export function MenuRichOption({
  Icon,
  color,
  title,
  description,
  note,
  disabled: isDisabled = false,
  onClick,
}: {
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  color: ChipColor;
  title: string;
  description: string;
  /** Why it cannot be done yet, in one word. */
  note?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={isDisabled}
      aria-disabled={isDisabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors',
        isDisabled ? 'cursor-not-allowed opacity-50' : HIGHLIGHT,
      )}
    >
      <IconChip Icon={Icon} color={color} size="sm" />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>

      {/* The same tag as in the rest of the app. It was a `<span>` with its
          own rounding, its own padding and a hand-written font size —11px,
          which is not on the scale—: three repeated decisions to say what
          `Tag` already says. */}
      {note && (
        <Tag tone="neutral" className="shrink-0 text-muted-foreground">
          {note}
        </Tag>
      )}
    </button>
  );
}
