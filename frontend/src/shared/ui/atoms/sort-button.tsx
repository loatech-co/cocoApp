import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

/** How a column sorts: its direction now, and what a tap does. */
export interface ColumnSort {
  direction: 'asc' | 'desc' | null;
  onChange: () => void;
}

/** The button that sorts a column, with its arrow always visible. */
export function SortButton({
  sort,
  align,
  children,
}: {
  sort: ColumnSort;
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
        // A header that sorts is a control: on the phone, the touch floor.
        'mobile:min-h-[42px]',
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
