/**
 * The head of a phone sheet, written once: every sheet that rises from the
 * bottom —the `BottomSheet`s and the transaction sheet— draws its header with
 * these, so they start at the same height and line up the same way.
 *
 * ── 24 from the sheet's top edge ────────────────────────────────────────────
 * The drag handle lives INSIDE those 24, laid over them, so it does not push
 * the header down: a sheet with a handle and one without start their title at
 * the same height. On the sides, the 16px gutter.
 *
 * ── Aligned to the TOP ──────────────────────────────────────────────────────
 * The leading icon, the title and the trailing actions hang from the same top
 * line. The title sits in a box as tall as a phone button (42), centered in it,
 * so a one-line title reads level with its close button; a title that wraps
 * grows downward, and the icon and the close stay where they were.
 */

/** The head's padding: 24 from the top edge, the 16 gutter on the sides. */
export const SHEET_HEAD_PADDING = 'px-4 pt-6';

/** The row: leading icon, title and actions, all from the top. */
export const SHEET_HEAD_ROW = 'flex items-start gap-3';

/** The title's box: as tall as a phone button, so one line sits level with it. */
export const SHEET_TITLE_BOX = 'flex min-h-[42px] min-w-0 flex-1 flex-col justify-center';

/** The title: the same size and weight in every sheet. It wraps; it is not cut. */
export const SHEET_TITLE = 'font-display text-lg font-semibold leading-tight';
