import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';

/**
 * The header and the footer of a modal.
 *
 * ── Why they live outside `Modal` ───────────────────────────────────────────
 * Because there are TWO frames. `ui/modal.tsx` serves the modals that fit its
 * shape —a title, a description line, a close X— and the transaction's has its
 * own, because it carries a color swatch before the title and a different
 * width. Written inside `Modal`, the transaction's could not use them and they
 * got copied; standing alone, both use them.
 *
 * And the footer was written THREE times —cost center, concept and
 * transaction—, all three with `flex-1` on both buttons. In a narrow modal
 * that looks fine; in the transaction's, which reached 1024px, each button
 * ate half the screen and «Cancelar» weighed exactly the same as
 * «Registrar».
 */

/**
 * The panel of a modal: the white box that floats over the backdrop.
 *
 * ── Why it is a class and not a component ───────────────────────────────────
 * Because the two frames put different things inside —the transaction's
 * carries steps, camera and reading— and what they share is the BOX: a column
 * with a maximum height and a minimum one. Exporting the class is the same
 * device as `BLOCK` and `FLOATING_SURFACE`: a single place where the
 * measurement changes.
 *
 * ── The minimum height: 400px ───────────────────────────────────────────────
 * Without it, a modal measures whatever its form measures, and that turns the
 * same window into three windows: «Nuevo categoría» came out at 260px, «Nuevo
 * concepto» at 420 and the transaction's at 700. Opening two in a row meant
 * watching the panel grow and shrink in the same spot on the screen, and in
 * the short one the buttons sat at mid-height, where nobody looks for them.
 *
 * ── Why `min(400px, 92dvh)` and not plain 400px ─────────────────────────────
 * Because in CSS the minimum height WINS over the maximum: on a short screen
 * —a small phone, a half-height window— a `min-h` of 600 would eat the
 * `max-h` of 92dvh and the modal would run off the bottom, with its buttons
 * outside. With `min()` the minimum can never exceed the maximum.

 * It was 600 and came down to 400: with 600, a two-field modal —a category, a
 * confirmation with one picker— opened with a hand's width of empty space
 * below its buttons. The minimum is there so that opening two modals in a row
 * is not watching the panel grow and shrink, not to stretch the short ones.
 *
 * ── The maximum width: 720px ────────────────────────────────────────────────
 * And here, not at each call site. The transaction's modal reached 1024
 * because its receipt column asked for room, and a 1024 modal on a 1440
 * screen is a window inside another: it stops reading as something that is
 * ON TOP of the app and starts reading as another screen.
 *
 * A call site may ask for LESS —the confirmation measures `max-w-md`— but not
 * more: the cap lives here so that the day it changes, it changes once.
 */
export const MODAL_PANEL =
  'flex max-h-[92dvh] min-h-[min(400px,92dvh)] w-full flex-col sm:max-w-[720px]';

/**
 * The header of a modal.
 *
 * ── Why it does not scroll ──────────────────────────────────────────────────
 * Whoever places it sets that —with `shrink-0` inside a column—, and it is
 * needed: in a long modal the title and the close X scrolled off the top, and
 * halfway through a form there was nothing left on screen saying what was
 * being edited or how to get out.
 *
 * ── Why the close X goes next to the other actions ──────────────────────────
 * Because delete, edit and close are the three things that can be done with
 * the WHOLE modal, as opposed to the ones done with what is inside it. Spread
 * over two corners, they have to be looked for separately.
 */
export function ModalHeader({
  title,
  description,
  leading,
  actions,
  onClose,
  className,
}: {
  title: ReactNode;
  /** What this modal is, in one sentence. */
  description?: string | undefined;
  /** Goes before the title: the color swatch of a transaction. */
  leading?: ReactNode;
  /** Icon buttons to the left of the close X. Delete, edit. */
  actions?: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // 16 on all four sides, like the body: the header and what is below
        // it are the same column, and two different insets look like a step
        // on the left edge of the modal.
        'flex shrink-0 items-start justify-between gap-3 px-4 pb-4 pt-4',
        className,
      )}
    >
      {/*
        The inner row is centered and the outer one starts at the top, and
        they are not the same: the swatch has to sit level with the title —not
        with its description line—, and the close X has to stay at the top
        even if there are two lines of explanation below.
      */}
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-semibold leading-tight">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <Button
          type="button"
          variant="ghost"
          size="sm-icon"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/**
 * The footer of a modal: what closes it and what confirms.
 *
 * ── Why the buttons do NOT stretch ──────────────────────────────────────────
 * The three footers there were carried `flex-1` on both buttons, so they
 * split the width in half. In a narrow modal it goes unnoticed; in the
 * transaction's, which reached 1024px, each button measured 480px and
 * «Cancelar» weighed exactly the same as «Registrar». A button the size of
 * its text says which one is the main action without having to shout it.
 *
 * ── Why on the right ────────────────────────────────────────────────────────
 * It is where a form finishes being read: it is scanned top to bottom and
 * left to right, and the action that closes it goes where the scan ends.
 *
 * ── Why on the phone they stack at full width ───────────────────────────────
 * Because two buttons the size of their text, in a corner, are two small
 * targets close together: it is where you tap «Cancelar» meaning to tap
 * «Guardar». Stacked and full width there is no way to get it wrong.
 *
 * And they stack in the ORDER they are written, without reversing it: on the
 * phone this modal is attached to the foot of the screen, so whatever is
 * lowest is what sits closest to the thumb, and that is where the main action
 * has to be. Reversing it —as the desktop convention does, which lifts the
 * primary button— would push it away precisely on the screen where it is
 * hardest to reach.
 *
 * ── Why `mt-auto` ───────────────────────────────────────────────────────────
 * Since the panel has a minimum height, a short form leaves room to spare
 * below. Without this the buttons stayed stuck to the last field, at
 * mid-height, with a hand's width of empty space below: it looked like a
 * half-loaded modal. The automatic margin sends them to the bottom, which is
 * where reading ends.
 *
 * It only does something inside a flex column with room to spare. In the
 * confirmation, which is not one, it does no harm: there the call site's
 * `mt-6` rules.
 */
export function ModalFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mt-auto flex flex-col gap-2 pt-2',
        'sm:flex-row sm:justify-end',
        // Full width when stacked, the size of their text in a row.
        '[&>*]:w-full sm:[&>*]:w-auto',
        className,
      )}
      {...props}
    />
  );
}

/**
 * The body of a modal: what scrolls between the header and the edge.
 *
 * `min-h-0` lets it shrink inside the panel's column (without it, it measures
 * whatever its content measures and runs over the maximum height). It is a
 * COLUMN because the panel has a minimum height: that way `ModalFooter` can go
 * to the bottom. And the bottom padding reserves the phone's safe edge: stuck
 * to the foot, the last row fell under the system bar.
 *
 * Both frames use it, `Modal` and the transaction's modal.
 */
export function ModalBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
      {children}
    </div>
  );
}
