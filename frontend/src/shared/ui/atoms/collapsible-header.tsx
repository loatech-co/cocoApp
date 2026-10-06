import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The header of a card that collapses: a chevron and what names it.
 *
 * The chevron points right when closed and down when open, and the WHOLE header is
 * the control —not just the chevron—, with `aria-expanded`. It takes the width
 * left free by whatever goes beside it (a card menu, for example).
 *
 * `p-3 sm:p-4` and not `p-4 sm:p-6`: twenty-four pixels above an 18px
 * title is more air than text, and a header is not the content of the
 * card —what one comes to read is below—.
 */
export function CollapsibleHeader({
  isOpen,
  onToggle,
  children,
}: {
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left sm:p-4"
    >
      <Chevron className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      {children}
    </button>
  );
}
