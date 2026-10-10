import { createContext, use } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * «You are inside a field with a floating label».
 *
 * ── Why a context and not a prop ────────────────────────────────────────────
 * Because the only thing that changes is the TOP PADDING of the control, to
 * make room for the raised label, and five components with five different
 * structures have to know it: a bare `<input>`, an `<input>` with absolutely
 * positioned icons, a `<textarea>`, the trigger of a dropdown —which `Menu`
 * paints, two levels further down— and the one of the date picker.
 *
 * Passing it as a prop would force each of the nine call sites to write it,
 * and `Menu` to forward it to a button that is not its own. With a context,
 * no call site changes and each control reads it where it needs it.
 *
 * And it is not state: it is «where I am». A context whose value never
 * changes does not cause a single extra render.
 */
export const InsideField = createContext(false);

/** `true` if this control lives inside a `Field`. */
export function useInsideField(): boolean {
  return use(InsideField);
}

/**
 * The gap a control with a floating label reserves on top.
 *
 * 20px on top and 4 at the bottom in a 44 field: the raised label takes 7 to
 * 18, and the value stays centered in the bottom half. It lives here, next to
 * the context, because the five controls have to reserve exactly the same
 * one: with two different values, two fields in the same row align their
 * text at different heights.
 */
export const LABEL_GAP = 'pb-1 pt-5';

/**
 * How a field with focus looks.
 *
 * ── Thin and translucent ────────────────────────────────────────────────────
 * It was the ring's border at full ink PLUS a 1px ring, also at full ink: two
 * pixels of saturated green around the box. With four fields in a modal, the
 * focused one did not read as focused but as selected, or as flagged in red
 * but in green.
 *
 * Now it is a single stroke: the border tinted at 60 % —one pixel, the same
 * it had at rest, changing color and not thickness— and the ring lowered to
 * 20 %, which is no longer an edge but the halo that lifts it off what is
 * behind. It is still the first place the eye goes when looking at the modal,
 * which is all it has to do.
 *
 * ── And only with `:focus-visible` ──────────────────────────────────────────
 * Never with `:focus`. The difference is exactly the rule: `:focus` also
 * lights up when the focus is set by the program —on opening a modal, on
 * closing a dropdown that hands it back to its button— and then there is a
 * field lit up that nobody chose.
 *
 * The error is the exception and goes at full ink: a wrongly filled field has
 * to be visible from the other side of the modal.
 */
export const FIELD_FOCUS =
  'outline-none focus-visible:border-ring/60 focus-visible:ring-1 focus-visible:ring-ring/20';

/**
 * The look of a field that DROPS DOWN: a `Select`, a `Combo`, a date picker.
 *
 * All three wrote it by hand and had already drifted apart —one had
 * `aria-expanded:border-ring` and the others did not—. They are the same
 * object: a box with a field's border, which tints on hover and lights up on
 * receiving focus, with its value on the left and what it opens on the right.
 *
 * The border is the FIELDS' one —`--input`— and not the containers': a
 * dropdown gets filled in, and it has to weigh the same as the text field
 * next to it in the same row.
 */
export function fieldTrigger(isSmall = false): string {
  return cn(
    'flex w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card text-left',
    'transition-colors hover:border-ring/40',
    FIELD_FOCUS,
    'aria-expanded:border-ring',
    // The touch floor: disabled and enabled measure the same, or the row
    // jumps on being disabled.
    'mobile:min-h-[42px]',
    // The right padding equals the left one because what it opens is
    // already inside the flex: there is nothing to dodge.
    isSmall ? 'h-9 px-3 text-xs' : 'h-11 px-3 text-sm',
  );
}
