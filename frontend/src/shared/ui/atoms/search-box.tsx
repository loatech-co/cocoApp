import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The box for filtering a list that is already in view: a magnifier and the text.
 *
 * It is not an `Input`. A form field stores a value and carries its floating
 * label and its ring; this only narrows what is underneath, and it reads as
 * part of the list and not as one more field of the sheet.
 *
 * | Shape    | Where                                                        |
 * | -------- | ------------------------------------------------------------ |
 * | `header` | At the top of a dropdown, separated from the list by a rule  |
 * | `box`    | Inside a block, over a grid: the icons one                   |
 */
const SHAPES = {
  header: { box: 'border-b border-border px-3 py-2', field: '' },
  box: { box: 'rounded-md border border-input bg-card px-3', field: 'h-9' },
} as const;

export function SearchBox({
  shape,
  ...props
}: Omit<ComponentProps<'input'>, 'className' | 'type'> & { shape: keyof typeof SHAPES }) {
  return (
    <div className={cn('flex items-center gap-2', SHAPES[shape].box)}>
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        className={cn(
          'min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground',
          SHAPES[shape].field,
        )}
        {...props}
      />
    </div>
  );
}
