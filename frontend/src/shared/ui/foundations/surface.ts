/**
 * The surface of everything that FLOATS over the page.
 *
 * A dropdown, a calendar, a modal, a confirmation, a chart's tooltip and the
 * toast in a corner are different things with one job in common: to lift off
 * the plane and say "this is on top". That is three decisions —color, shadow
 * and line— and they were written ten times.
 *
 * ── Why the LINE cannot be missing ──────────────────────────────────────────
 * Because the shadow alone does not delimit in any theme: in light the
 * popover is white on an almost-white canvas, and in dark the shadow is black
 * on an almost-black background. What draws the edge is the line.
 *
 * ── Why it is the THEME's border and not a 5 % black ────────────────────────
 * It was `ring-black/5` with `dark:ring-white/12`: two made-up values that
 * come from no token. On #ffffff, a 5 % black gives #f2f2f2 —two points of
 * difference from the canvas—, so the panel had no edge. `--border` is
 * computed by the theme precisely to show against its surfaces, in both
 * modes, and it changes with it.
 *
 * It is a RING and not a border on purpose: the ring takes no room, so adding
 * it does not shift the content of the ten places that carry it by a single
 * pixel.
 */
export const FLOATING_SURFACE =
  'bg-popover text-popover-foreground shadow-[var(--sombra-flotante)] ring-1 ring-border';

/**
 * What appears all at once reads as a painting glitch.
 *
 * 120ms and 4 % of scale: enough for the eye to understand that the panel
 * COMES OUT of the button that opened it, and too little for anyone to wait.
 * The animation is in `index.css` —with its exception for whoever asks for
 * reduced motion— and here it is only named.
 */
export const SURGE = 'surge';

/**
 * The highlight of WHAT RESPONDS to the cursor: an option, a row, a day of
 * the calendar, a tile.
 *
 * ── Why the accent as INK and not as a surface ──────────────────────────────
 * It was `bg-accent`, which in this theme is a muted emerald green. It works
 * —you can see something changed— but it looks like nothing: the color with
 * which this app says «this» is the lime, and it was reserved for the
 * selected. So hovering showed one green and selecting another, without the
 * relation between the two meaning anything.
 *
 * Now it is the same lime in both, at two intensities: at 10 % it tints the
 * background while the cursor is over it, and the selected keeps its still
 * background. The difference between «I am pointing at this» and «this is
 * what is there» becomes one of degree and not of color, which is what they
 * are.
 *
 * `--acento-tinta` and not `--primary`: it is the same color in dark, but in
 * light the primary is an almost-black green and this has to work as INK on
 * a light surface.
 */
export const HIGHLIGHT = 'hover:bg-acento-tinta/10 hover:text-acento-tinta';

/**
 * The highlight of a LARGE surface that responds to the cursor: the slot for
 * the next category, the zone where receipts are dropped, the import one.
 *
 * ── A 10 % black, and not the accent ────────────────────────────────────────
 * What responds is tinted with the accent. Not here, and it is the exception
 * with the most history in the project: it was tried with the full
 * `bg-accent`, with a third and with 5 % of `--acento-tinta`, and all three
 * times the same thing showed —a GREEN rectangle switching on and off—.
 *
 * The reason is size. A color tint on 200 by 32 pixels is a hint; on a
 * thousand by two hundred and fifty, the eye integrates the hue over the
 * whole area and reads it as the zone changing state, not as the cursor being
 * over it. Lowering the percentage does not fix that: the color is still a
 * color, only weaker.
 *
 * A 10 % black introduces no color: it sinks what is below a little, which is
 * what a surface does when pressed. It works in both themes for the same
 * reason —it darkens the light one and darkens the dark one— and it does not
 * compete with the app's green, which is what this was about.
 *
 * The text goes up to full ink at the same time, and that is what makes the
 * response legible on a background that barely moves.
 *
 * ── And it does not touch the stroke ────────────────────────────────────────
 * These surfaces carry a dashed border. Changing its color redraws the whole
 * outline at once, and on a rectangle that size that reads as motion and not
 * as a response. The stroke is reserved for when there is a file over it:
 * there there is something to say —«this is what will receive it»— and the
 * color change says it in one go.
 */
export const SURFACE_HIGHLIGHT = 'hover:bg-black/10 hover:text-foreground';
