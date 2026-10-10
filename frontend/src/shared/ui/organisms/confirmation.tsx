import { Loader2 } from 'lucide-react';
import { type ReactNode } from 'react';

import { useEscapeToClose } from '@/shared/lib/escape';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';
import { FLOATING_SURFACE } from '@/shared/ui/foundations/surface';
import { ModalFooter } from '@/shared/ui/molecules/modal-parts';

interface ConfirmationProps {
  isOpen: boolean;
  title: string;
  /** What is going to happen. Concrete: names, quantities, consequences. */
  children: ReactNode;
  confirmLabel?: string;
  /** Paints the action red. Only for what destroys something. */
  isDestructive?: boolean;
  isBusy?: boolean;
  /**
   * Disables the confirm button because a piece of data is missing.
   *
   * Different from `isBusy`, which says «it was already pressed, wait». This
   * says «it cannot be done yet». The deletion of a category with
   * transactions inside uses it: until it is said where they move to there is
   * nothing to confirm, and finding out after pressing «Eliminar» in a dialog
   * that warns it cannot be undone is the worst thing that can happen there.
   */
  isConfirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
/**
 * Asking for confirmation before something that does not undo itself.
 *
 * ── Why a dialog and not a `confirm()` ──────────────────────────────────────
 * The browser's is drawn with the operating system's colors, blocks the whole
 * page and lets nothing be explained: only two buttons and one line fit. What
 * is needed here is to say WHAT is going to happen —that archiving is not
 * deleting, that the transactions keep their classification—, and that does
 * not fit in one line.
 *
 * ── The title STATES and the body asks ──────────────────────────────────────
 * «Eliminar movimiento», not «¿Eliminar este movimiento?». The question goes
 * at the end of the body, after saying what happens and that it cannot be
 * undone, and with both asking the dialog questioned twice and answered once.
 *
 * The body carries three beats, in this order: what is about to happen, that
 * it cannot be undone, and the question. The order matters: the question
 * means nothing before knowing what is being answered.
 *
 * ── Why the dangerous button is not the one with focus ──────────────────────
 * Because whoever arrives with Enter pressed did not mean to confirm anything:
 * they were coming from pressing something else. Focus starts on Cancel.
 */
export function Confirmation({
  isOpen,
  title,
  children,
  confirmLabel = t('ui.confirm.confirm'),
  isDestructive = false,
  isBusy = false,
  isConfirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmationProps) {
  useEscapeToClose(isOpen, onCancel);

  if (!isOpen) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      className={cn(
        'fixed inset-0 z-[60] flex items-center justify-center bg-[var(--scrim)] backdrop-blur-sm',
        // 24 to the edge on the phone, the same as the rest of the modals.
        'p-6 sm:p-4',
        'reveal',
      )}
    >
      <div
        className={cn(
          // 24 of padding, not 16. It is the only surface in the app that
          // opens ON TOP of another modal —and with its own backdrop—, so it
          // has nothing around it to align with: what frames it is its air.
          // With 16 the text sat a finger from the edge and the box looked like
          // an overgrown toast, not a dialog.
          'w-full max-w-md rounded-lg p-6',
          FLOATING_SURFACE,
          'emerge',
        )}
      >
        <h2 className="font-display text-lg font-semibold leading-tight">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div>

        <ConfirmationFooter
          confirmLabel={confirmLabel}
          isDestructive={isDestructive}
          isBusy={isBusy}
          isConfirmDisabled={isConfirmDisabled}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}

function ConfirmationFooter({
  confirmLabel,
  isDestructive,
  isBusy,
  isConfirmDisabled,
  onConfirm,
  onCancel,
}: Required<Omit<ConfirmationProps, 'isOpen' | 'title' | 'children'>>) {
  return (
    <ModalFooter className="mt-6">
      {/*
        `outline` and not `ghost`. A button without an outline next to a
        filled one does not read as a button: it reads as the text next to
        the button, and the way out of a dialog that asks before deleting
        something is exactly what must not be hard to find.
      */}
      {/*
        And without `autoFocus`. It had it so that the way out would be the
        first thing the keyboard found, and the price was that every
        confirmation opened with a lit-up button nobody had chosen. The focus
        rule applies here too: it is painted when asked for. The way out is
        still one Escape or one Tab away.
      */}
      <Button type="button" variant="outline" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      <Button
        type="button"
        variant={isDestructive ? 'destructive' : 'default'}
        disabled={isBusy || isConfirmDisabled}
        onClick={onConfirm}
      >
        {isBusy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {confirmLabel}
      </Button>
    </ModalFooter>
  );
}
