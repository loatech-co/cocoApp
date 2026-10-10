import { Check, CornerDownLeft, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';

/**
 * The «create what is missing» row, at the foot of a list with a search box.
 *
 * Exported because the concept search offers the same: two copies drift
 * apart. `hasEnterHint` adds the hint that Enter picks it, when it is the only
 * thing that can be picked.
 */
export function CreateOption({
  isCreating,
  hasEnterHint = false,
  onCreate,
  children,
}: {
  isCreating: boolean;
  hasEnterHint?: boolean;
  onCreate: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onCreate}
      disabled={isCreating}
      className={cn(
        'flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm',
        'font-medium transition-colors',
        HIGHLIGHT,
        'disabled:opacity-60',
      )}
    >
      <Plus className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{children}</span>
      {hasEnterHint && (
        <CornerDownLeft className="ml-auto size-3.5 shrink-0 opacity-50" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * A selectable row of a dropdown with a search box.
 *
 * Exported because the concept search uses it too: the same row, with the
 * same highlight and the same check mark, so that picking a concept looks the
 * same in both places. Two copies drift apart.
 */
export function Option({
  id,
  isSelected,
  isActive = false,
  onClick,
  children,
}: {
  /**
   * For a list driven by `aria-activedescendant`. Such an option is pointed
   * at, never focused, so it leaves the tab order: the focus stays in the box.
   */
  id?: string;
  isSelected: boolean;
  /** The one the arrows point at: painted like the one under the cursor. */
  isActive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      id={id}
      tabIndex={id === undefined ? undefined : -1}
      aria-selected={isSelected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        'mobile:min-h-[42px]',
        isSelected ? cn('bg-muted font-medium', HIGHLIGHT) : HIGHLIGHT,
        isActive && 'bg-acento-tinta/10 text-acento-tinta',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );
}
