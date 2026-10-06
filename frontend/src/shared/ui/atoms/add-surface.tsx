import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { REALCE_DE_SUPERFICIE } from '@/shared/ui/foundations/superficie';

/**
 * The dashed slot where the next thing will go: «Agregar categoría»,
 * «Agregar atajo». A plus and a phrase, full width.
 *
 * | Shape  | Where                                                          |
 * | ------ | -------------------------------------------------------------- |
 * | `slot` | The ONLY thing there is —a center without categories—: tall and stacked |
 * | `bar`  | Below what is already there: the icon and the text in a row    |
 * | `row`  | Inside a grid of tiles: thin stroke and the touch floor        |
 *
 * Without categories, the slot is not one more tile: it is the place where the
 * structure will start, and `min-h-64` (256px, the step of the scale) says so.
 * With something above it is a bar: stacked and tall it would be a dashed rectangle
 * larger than any of the cards, and what has to be looked at is them.
 *
 * The two large ones respond with `REALCE_DE_SUPERFICIE`, the low highlight of
 * large surfaces (the why is in `superficie.ts`): the full accent over
 * a thousand by two hundred fifty pixels is a flash.
 */
const SHAPES = {
  slot: cn('min-h-64 flex-col gap-2 border-2 p-4', REALCE_DE_SUPERFICIE),
  bar: cn('gap-2 border-2 p-4', REALCE_DE_SUPERFICIE),
  row: 'min-h-[42px] gap-2 border py-3 hover:bg-muted',
} as const;

export function AddSurface({
  shape,
  onClick,
  children,
}: {
  shape: keyof typeof SHAPES;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-center rounded-lg border-dashed border-border text-center',
        'text-sm font-medium text-muted-foreground transition-colors',
        SHAPES[shape],
      )}
    >
      <Plus className={cn('shrink-0', shape === 'row' ? 'size-4' : 'size-5')} aria-hidden="true" />
      {children}
    </button>
  );
}
