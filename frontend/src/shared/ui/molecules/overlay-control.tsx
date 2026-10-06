import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';

/**
 * The line between two groups of controls inside the same pill.
 *
 * ── What it separates ───────────────────────────────────────────────────────
 * Moving from what MODIFIES. Going to the next receipt changes nothing; adding
 * and deleting do, and deleting cannot be undone. Placed in a row with nothing
 * in between, the arrows and the plus read as a single strip of five buttons,
 * and the one right after the counter —the plus— gets pressed in the belief
 * that it is «next».
 *
 * ── Why a line and not a gap ────────────────────────────────────────────────
 * A gap inside a 40px-tall pill has to be large to read as a separation, and
 * then the pill grows sideways over the paper. One pixel says the same and
 * takes no room.
 *
 * It is at 25 % of the ink: it has to look like a division, not like a sixth
 * control.
 */
export function ControlSeparator() {
  return <span aria-hidden="true" className="mx-0.5 h-4 w-px shrink-0 bg-sala-tinta/25" />;
}

/**
 * A control that lives ON a document or on the dark backdrop of a viewer.
 *
 * It does not use the app's palette: on top of a receipt —which is white— a
 * light control disappears. The controls of a preview are supplied by whoever
 * uses it: the modal of an unsaved transaction removes files from memory and
 * the one of a saved transaction deletes them from the server, but both
 * buttons are the same object.
 */
export function OverlayButton({
  onClick,
  label,
  disabled: isDisabled = false,
  className,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      // Round: these controls live inside a round pill, and a square
      // highlight there leaves two corners sticking out at each end.
      size="sm-icon-round"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
      title={label}
      className={cn('text-sala-tinta hover:bg-sala-tinta/10 hover:text-sala-tinta', className)}
    >
      {children}
    </Button>
  );
}

/**
 * The readout between two controls: the zoom percentage, the page. Tabular
 * figures, so that «95 %» and «100 %» do not move the buttons next to them.
 *
 * With `onClick` it is a button (the percentage goes back to normal size: it
 * is where everyone clicks when they got lost zooming in); without it, it is
 * only read.
 *
 * | Width     | What fits                                            |
 * | --------- | ---------------------------------------------------- |
 * | `preview` | «100 %» in 2xs type, over the preview                |
 * | `zoom`    | «100 %» in the full-screen viewer                    |
 * | `pages`   | «Pág. 12 / 30» in the viewer                         |
 */
const READOUT_WIDTHS = {
  preview: 'min-w-[3rem] text-2xs',
  zoom: 'min-w-[3.5rem] text-xs',
  pages: 'min-w-[4.5rem] text-xs',
} as const;

export function ControlReadout({
  width,
  title,
  onClick,
  children,
}: {
  width: keyof typeof READOUT_WIDTHS;
  /** The hint on hover, if it can be pressed. */
  title?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const classes = cn('tabular text-center font-medium text-sala-tinta', READOUT_WIDTHS[width]);
  if (!onClick) return <span className={classes}>{children}</span>;
  return (
    <button type="button" onClick={onClick} title={title} className={classes}>
      {children}
    </button>
  );
}
