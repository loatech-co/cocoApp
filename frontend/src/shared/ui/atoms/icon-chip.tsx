import type { ComponentType } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The pastels the app marks its things with.
 *
 * ── They are named by their ROLE, not by their color ────────────────────────
 * They were `violeta`, `turquesa`, `verde` and `lima`, and that name is exactly what
 * forces renaming everything when the theme changes: the expense chip went
 * from violet to pine and the name became a lie. With the role in the name,
 * a new theme changes two lines in `index.css` and not a single call.
 *
 * And they live here and not in each screen because the COLOR MEANS SOMETHING: the expense one
 * is the same in the indicator at the top and in the menu that records it.
 * Repeated in two places, one day someone changes one and the same thing ends up
 * having two colors depending on where one comes in from.
 */
const CHIPS = {
  expense: { background: 'var(--chip-gasto)', ink: 'var(--chip-gasto-tinta)' },
  income: { background: 'var(--chip-ingreso)', ink: 'var(--chip-ingreso-tinta)' },
  budget: { background: 'var(--chip-presupuesto)', ink: 'var(--chip-presupuesto-tinta)' },
  transactions: { background: 'var(--chip-movimientos)', ink: 'var(--chip-movimientos-tinta)' },
} as const;

export type ChipColor = keyof typeof CHIPS;

/**
 * An icon inside its pastel.
 *
 * The size is chosen by name and not written in the call, for the same
 * reason as with buttons: two pastels of similar but different sizes
 * read as an oversight.
 */
export function IconChip({
  Icon,
  color,
  size = 'default',
  className,
}: {
  Icon: ComponentType<{
    className?: string;
    'aria-hidden'?: boolean;
    fill?: string;
    fillOpacity?: number;
    strokeWidth?: number;
  }>;
  color: ChipColor;
  /** `sm` for a menu row; `default` for a card. */
  size?: 'sm' | 'default';
  className?: string;
}) {
  const { background, ink } = CHIPS[color];
  const isSmall = size === 'sm';

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        isSmall ? 'size-9' : 'size-11 sm:size-12',
        className,
      )}
      style={{ backgroundColor: background, color: ink }}
    >
      <Icon
        className={isSmall ? 'size-4' : 'size-5'}
        fill="currentColor"
        fillOpacity={0.2}
        strokeWidth={1.9}
        aria-hidden
      />
    </span>
  );
}
