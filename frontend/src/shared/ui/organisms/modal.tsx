import { type ReactNode } from 'react';

import { useEscapeToClose } from '@/shared/lib/escape';
import { cn } from '@/shared/lib/utils';
import { FLOATING_SURFACE } from '@/shared/ui/foundations/surface';
import { ModalHeader, ModalBody, MODAL_PANEL } from '@/shared/ui/molecules/modal-parts';

interface ModalProps {
  isOpen: boolean;
  title: string;
  /** The line under the title: what this is, in one sentence. */
  description?: string;
  /** Icon buttons to the left of the close X. Delete, for example. */
  actions?: ReactNode;
  width?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The frame of a modal: the backdrop, the panel and its header.
 *
 * ── Why it is a component and is not copied ─────────────────────────────────
 * Because the modal is not a rectangle: it is a backdrop that closes when
 * tapped, an escape key, a panel that slides up from the bottom on a phone and
 * is centered on a desktop, a maximum height with scrolling inside and a close
 * X in its corner. That is six decisions, and copied they start out the same
 * and drift apart: one learns to close with Escape and the other does not, and
 * the same app behaves differently depending on where you come in.
 *
 * ── Why it sticks to the bottom on the phone ────────────────────────────────
 * Because that is where the thumb reaches. A centered panel with the buttons
 * at mid-screen forces switching hands to save.
 *
 * ── Why it does NOT focus its first field ───────────────────────────────────
 * Because opening a modal is not starting to type in it. The first field
 * focused and highlighted says «type here» when what one comes to do is almost
 * always READ what is there —which transaction it is, what amount it has— and
 * correct one specific field, which is rarely the first. And with the floating
 * label it is worse: the focused field raises its label and shows its
 * placeholder, so an empty form looks half filled in.
 *
 * Where it DOES focus is on a field that appears because someone asked for
 * it: the search that comes out when the magnifier is pressed, the «Agregar
 * concepto» that comes out when its button is pressed. There the focus is not
 * an extra, it is the second half of that click; without it one would have to
 * click and then aim at the field that just appeared.
 *
 * The confirmation is the other special case, and it focuses CANCEL on
 * purpose: whoever arrives with Enter pressed did not mean to delete anything,
 * they were coming from pressing something else.
 *
 * ── Why the header does NOT scroll ──────────────────────────────────────────
 * The scroll was on the whole panel, so in a long modal the title and the
 * close X went off the top: halfway through a form there was nothing left on
 * screen saying what was being edited or how to get out, and the only way to
 * close was to scroll up again. Now the panel is a column with two parts: the
 * header, which stays, and the body, which is what gets scrolled.
 */
export function Modal({
  isOpen,
  title,
  description,
  actions,
  width = 'sm:max-w-xl',
  onClose,
  children,
}: ModalProps) {
  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      // `onMouseDown` and not `onClick`: with click, dragging the mouse from
      // inside the panel to the backdrop —selecting some text, for example—
      // closed the modal with everything typed inside it.
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      // The mark the surfaces below ask about. A focus trap steps aside while
      // a modal is open, and Escape closes the modal first: two traps fighting
      // over the Tab key are a keyboard that does nothing.
      data-modal=""
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-[var(--velo)] backdrop-blur-sm',
        /*
          ── 24 to the edge of the screen, on the phone ────────────────────
          The modal is not full-bleed. Stuck to the three edges, it reads as
          another SCREEN: it eats the whole width, the bottom corner
          disappears and the only thing saying the app is still behind is a
          strip of backdrop at the top. Separated, it reads again as what it
          is —something ON TOP— and the backdrop shows on all four sides.

          It is distance from the modal to the edge of the screen, not the
          modal's padding: the inside stays at 16, which is what `Modal` and
          `ModalHeader` already set.
        */
        'p-6',
        'se-revela sm:items-center sm:p-4',
      )}
    >
      <div
        className={cn(
          MODAL_PANEL,
          FLOATING_SURFACE,
          'emerge',
          // Stuck to the bottom it is rounded only on top: the bottom corners
          // fall off the screen and curving them leaves two notches of the
          // background. All four corners, no longer just the top ones:
          // separated from the bottom edge, the bottom ones show too, and two
          // straight corners under two curved ones is a half-drawn box.
          'rounded-lg',
          width,
        )}
      >
        <ModalHeader title={title} description={description} actions={actions} onClose={onClose} />

        {/*
          `min-h-0` is what lets this shrink: without it, a child of a flex
          column measures whatever its content measures and runs over the
          panel's maximum height —the same reason the summary row overflowed
          onto the table—.

          And the bottom padding reserves the phone's safe edge: stuck to the
          foot, the modal's last row fell under the system bar.

          It is a COLUMN because the panel has a minimum height: with a short
          form there is room to spare, and the form needs to be able to
          stretch to take its buttons to the bottom. In a block box there
          would be no room to share and the footer would sit at mid-height.
        */}
        <ModalBody>{children}</ModalBody>
      </div>
    </div>
  );
}
