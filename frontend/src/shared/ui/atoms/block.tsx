import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * A surface INSIDE another: a section of a sheet, a box of
 * options, a notice with its own frame.
 *
 * ── Why it is separated by FILL and not by border ───────────────────────────
 * It had a border while the fill did not work: `card` and `popover` were
 * both white in light, and in dark `muted` and `popover` were a step
 * of nothing apart. A filled block inside a modal was invisible, so what
 * did the job was the line.
 *
 * With three surfaces that is over. `--muted` is THE SELECTED and sits a
 * real step away from the material in both themes, and the step goes in the
 * direction each one needs: in light downward —a block is a hollow
 * in the card, as the well is in the page— and in dark upward,
 * because there what is closer is what is lighter.
 *
 * And it goes at full opacity, not at 40 %: a fill at 40 % over a surface
 * that barely contrasts is half of almost nothing, which is exactly why
 * the line used to be needed.
 */
/**
 * The class, for what is not a `<div>`.
 *
 * A block can be a label that wraps a switch or a whole
 * button; neither of them can be a `<div>` without losing what it is. Those
 * use the class and are still a single place where the look changes.
 *
 * Six places wrote it by hand with FOUR different fills —30, 40 and 60
 * percent— and two radii, which is exactly how you can tell nobody
 * decided it: it was written six times and six came out.
 */
export const BLOCK = 'rounded-lg bg-muted p-3';

export function Block({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(BLOCK, className)} {...props} />;
}
