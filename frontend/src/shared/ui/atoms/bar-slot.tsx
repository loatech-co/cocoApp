import { Plus } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { cn } from '@/shared/lib/utils';

/**
 * The slots of the phone's bottom bar.
 *
 * They all measure the same —60 high and an equal share of the width— and carry the
 * same pair of colors, whether they lead to another screen or open something on top: whoever
 * looks at the bar has no reason to know which of the five changes screen and
 * which lifts a sheet. What tells them apart is what happens when tapping them.
 */
const SLOT =
  'flex h-15 min-w-0 flex-1 items-center justify-center transition-colors duration-[120ms]';

const ink = (isOn: boolean) => (isOn ? 'text-sidebar-active' : 'text-sidebar-muted');

type BarIconComponent = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean;
  fill?: string;
  fillOpacity?: number;
  strokeWidth?: number;
}>;

/** The icon of a slot: filled at 18 % of its own color, stroke 1.75. */
export function BarIcon({ Icon }: { Icon: BarIconComponent }) {
  return (
    <Icon
      className="size-6"
      fill="currentColor"
      fillOpacity={0.18}
      strokeWidth={1.75}
      aria-hidden={true}
    />
  );
}

/** A slot that leads to a section. */
export function BarSlotLink({
  to,
  isExact,
  label,
  Icon,
}: {
  to: string;
  isExact: boolean;
  label: string;
  Icon: BarIconComponent;
}) {
  return (
    <NavLink
      to={to}
      end={isExact}
      aria-label={label}
      className={({ isActive }) => cn(SLOT, ink(isActive))}
    >
      <BarIcon Icon={Icon} />
    </NavLink>
  );
}

/** A slot that leads nowhere: it opens something over the page. */
export function BarSlotButton({
  label,
  isOn,
  onClick,
  children,
}: {
  label: string;
  isOn: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={isOn}
      className={cn(SLOT, ink(isOn))}
    >
      {children}
    </button>
  );
}

/**
 * The bar's action: record an expense.
 *
 * Round, not a tile with corners: a tile would read as one more of the ones
 * it opens, and the only control in the bar that is not a destination should not
 * look like one of them. It rises 16 above the line, and 20 of bar remain
 * below. When pressed it drops 2, like a key.
 */
export function BarFab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'grid size-14 place-items-center rounded-full',
        '-mt-4',
        'bg-sidebar-active text-sidebar-active-foreground shadow-[var(--floating-shadow)]',
        'transition-transform duration-[120ms] active:translate-y-0.5',
      )}
    >
      <Plus className="size-6" strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}
