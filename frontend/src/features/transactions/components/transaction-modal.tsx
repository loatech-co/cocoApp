import type { ReactNode } from 'react';

import {
  useTransactionSheet,
  type TransactionSheet,
} from '@/features/transactions/hooks/use-transaction-sheet';
import { selectedPath } from '@/features/transactions/model/transactions';
import {
  type PendingPayment,
  type Transaction,
  type TransactionType,
} from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { FLOATING_SURFACE } from '@/shared/ui/foundations/surface';
import { ModalBody, MODAL_PANEL } from '@/shared/ui/molecules/modal-parts';
import { Confirmation } from '@/shared/ui/organisms/confirmation';

import { CameraCapture } from './camera-capture';
import { Scanning } from './reading-progress';
import { TransactionHeader } from './transaction-header';
import { TransactionSheetForm } from './transaction-sheet-form';

interface TransactionModalProps {
  isOpen: boolean;
  /** Without a transaction, the form creates. With one, it edits that one. */
  transaction?: Transaction | null | undefined;
  /**
   * The pending payment being confirmed, from the dashboard card.
   *
   * ── Why it is the whole payment and not just its concept ────────────────
   * Because a pending payment already carries almost the whole transaction:
   * which concept it is, when it was due and how much it usually costs. Passing
   * only the concept, the other two had to be typed while looking at the same
   * card that had just been tapped.
   *
   * ── And why that changes the whole sheet ────────────────────────────────
   * Confirming a payment is not recording an expense from scratch: there is no
   * need to decide HOW to start —the concept is there, what is missing is the
   * paper— so it opens straight into the form, with the fields filled in and the
   * receipt column waiting. What is written is what is EXPECTED, and the receipt
   * corrects it: see `PendingReceipts`.
   */
  payment?: PendingPayment | null;
  /** Which type to open with when CREATING. The "Nuevo movimiento" menu picks it. */
  defaultType?: TransactionType;
  onClose: () => void;
}

/**
 * THE ONLY transaction form: it creates and it edits.
 *
 * Having two —one to record and another to correct— guarantees they drift
 * apart: a field is added to one and forgotten in the other, and the person
 * finds out they can only add notes when editing. One component, two
 * modes.
 *
 * ── The three-level cascade ─────────────────────────────────────────────────
 * Cost center → category → concept. The CONCEPT is what gets saved, it is the leaf:
 * the two above exist to add up, not to classify. Picking one of the upper
 * ones and leaving it there would make a transaction that shows up in no
 * per-concept breakdown.
 *
 * What it needs to work is gathered by `useTransactionSheet`.
 */
export function TransactionModal(props: TransactionModalProps) {
  const { isOpen, transaction, payment, defaultType = 'expense', onClose } = props;
  const transactionSheet = useTransactionSheet({
    isOpen,
    transaction,
    payment,
    defaultType,
    onClose,
  });
  const { sheet } = transactionSheet;

  if (!isOpen) return null;
  const isEditing = Boolean(transaction);
  const { category, concept } = selectedPath(transactionSheet.tree, sheet.categoryId);

  return (
    <SheetOverlay isEditing={isEditing} onClose={onClose}>
      <TransactionHeader
        mode={{
          type: sheet.type,
          isEditing,
          isEditable: sheet.isEditable,
          // The `!transaction` is there on purpose: `payment` stays set while the
          // sheet is open, and as soon as it is saved it stops being pending.
          // Without it, the sheet of an existing transaction could be titled
          // «Confirmar pago» just for having come from that card.
          isConfirming: payment != null && !transaction ? payment : null,
        }}
        onEdit={() => sheet.setEditable(true)}
        onDelete={() => sheet.setIsConfirmingDeletion(true)}
        onClose={onClose}
      />

      {/* `min-h-0` is what lets this shrink inside the column: without
          it, it measures whatever its content measures and blows through the
          panel's max height. And it is a column in turn because the panel has
          a min height: with that the form can stretch and take its buttons
          to the bottom instead of leaving them halfway up. */}
      <ModalBody>
        <TransactionSteps sheet={transactionSheet} transaction={transaction} onClose={onClose} />

        <ConfirmTransactionDeletion
          isOpen={sheet.isConfirmingDeletion}
          isBusy={transactionSheet.save.remove.isPending}
          concept={concept?.name ?? category?.name ?? t('transactions.sheet.conceptFallback')}
          onCancel={() => sheet.setIsConfirmingDeletion(false)}
          onConfirm={() =>
            transaction &&
            transactionSheet.save.remove.mutate(transaction.id, {
              onSuccess: () => {
                sheet.setIsConfirmingDeletion(false);
                onClose();
              },
            })
          }
        />
      </ModalBody>
    </SheetOverlay>
  );
}

/** The camera, the reading or the form: whatever fills the sheet right now. */
function TransactionSteps({
  sheet: transactionSheet,
  transaction,
  onClose,
}: {
  sheet: TransactionSheet;
  transaction: Transaction | null | undefined;
  onClose: () => void;
}) {
  const { sheet, scan } = transactionSheet;

  if (sheet.step === 'camera') {
    return <CameraCapture onCapture={(a) => void scan(a)} onClose={() => sheet.setStep('form')} />;
  }

  if (sheet.step === 'reading') {
    return <Scanning file={sheet.pending[0]} progress={sheet.readingProgress} />;
  }

  return (
    <TransactionSheetForm
      sheet={sheet}
      tree={transactionSheet.tree}
      isStatic={transactionSheet.isStatic}
      createInside={transactionSheet.create.createInside}
      isCreating={transactionSheet.create.isCreating}
      recent={transactionSheet.recent}
      transaction={transaction}
      scan={scan}
      onSubmit={transactionSheet.save.onSubmit}
      isSaving={transactionSheet.save.isSaving}
      onCancel={() => {
        if (!transaction) {
          onClose();
          return;
        }
        sheet.discard();
        sheet.setEditable(false);
      }}
    />
  );
}

/** The sheet's scrim and panel. */
function SheetOverlay({
  isEditing,
  onClose,
  children,
}: {
  isEditing: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      // The shared scrim, `--scrim`. There used to be a `bg-carbon-950/50` here
      // that painted nothing —`carbon` was not a color in any palette of this
      // project—, so the modal floated over the page with no scrim behind it.
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)] backdrop-blur-sm',
        /*
          ── 24 to the edge of the screen, on the phone ────────────────────
          The sheet is not full-bleed. Stuck to three edges, it reads as another
          SCREEN: it eats the whole width, the bottom corner disappears and
          the only thing saying the app is still behind is a strip of scrim
          at the top. Set apart, it reads again as what it is —something that is
          ON TOP— and the scrim shows on all four sides.

          It is distance from the sheet to the edge of the screen, not padding of
          the sheet: the inside stays at 16, which is what `Modal` and
          `CabeceraDeModal` already set.
        */
        'p-6',
        'reveal sm:items-center sm:p-4',
      )}
      // `onMouseDown` on the scrim, and not `onClick` anywhere.
      //
      // With click, a drag that STARTS inside the panel and ends outside
      // —releasing the mouse a finger past the edge— fires the click on the
      // common ancestor, which is the scrim, and the sheet closed with everything
      // written inside. Here that is not a rare case: the receipt preview
      // is browsed by dragging, so the gesture that closes the sheet
      // is the same one used to look at the receipt.
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          isEditing
            ? t('transactions.sheet.editMovementTitle')
            : t('transactions.sheet.newMovementTitle')
        }
        // On mobile it comes in from the bottom and takes the width: it is the
        // pattern people expect from an app, and it keeps the thumb near the buttons.
        //
        // The width is set by `PANEL_DE_MODAL`, which caps it at 720 for every
        // sheet. And all four corners, not just the top ones: set apart
        // from the bottom edge, the bottom ones show too, and two straight edges
        // under two curved ones is a half-drawn box.
        className={cn(MODAL_PANEL, FLOATING_SURFACE, 'emerge', 'rounded-lg')}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The three beats: what is about to happen, that it cannot be undone, and the
 * question. What breaks the pattern is the middle sentence, and it is not a
 * detail: the name of this transaction IS its concept's, so the
 * trash can seems to be pointing at the concept. It is not. Without that sentence,
 * nobody deletes a mistyped expense for fear of taking «Aseo» down with it.
 */
function ConfirmTransactionDeletion({
  isOpen,
  isBusy,
  concept,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  isBusy: boolean;
  concept: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Confirmation
      isOpen={isOpen}
      title={t('transactions.sheet.deleteMovementTitle')}
      isDestructive
      confirmLabel={t('common.delete')}
      isBusy={isBusy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      {t('transactions.sheet.deleteWarning', { concept })}
    </Confirmation>
  );
}
