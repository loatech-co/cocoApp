import { Pencil, Trash2, TrendingDown, TrendingUp } from 'lucide-react';

import { capitalize, typeName } from '@/features/transactions/model/movement-form';
import { type PendingPayment, type TransactionType } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import { IconChip } from '@/shared/ui/atoms/icon-chip';
import { ModalHeader } from '@/shared/ui/molecules/modal-parts';

interface SheetMode {
  type: TransactionType;
  isEditing: boolean;
  isEditable: boolean;
  /** The payment being confirmed, only if the sheet is not for an already saved transaction. */
  isConfirming: PendingPayment | null;
}

/**
 * What is about to be done is not the same, so it is not called the same. «Confirmar
 * pago» on a concept that is covered in pieces promises to close the month, and what
 * is noted down is one installment of four: the list already offered «Registrar otro» and the
 * sheet that opens has to be the one that was asked for.
 */
function sheetTitle({ type, isEditing, isEditable, isConfirming }: SheetMode): string {
  if (isConfirming)
    return isConfirming.isMultiPayment
      ? t('transactions.sheet.registerAnother')
      : t('transactions.sheet.confirmPayment');
  if (!isEditing) return t('transactions.sheet.newOfType', { type: typeName(type) });
  return isEditable
    ? t('transactions.sheet.editOfType', { type: typeName(type) })
    : capitalize(typeName(type));
}

/**
 * Only when confirming a payment, and it says the three things needed: WHICH
 * payment it is —the title does not say—, that what is written is an expected value and not a
 * fact, and what to do so it stops being one.
 *
 * Without the second, a value computed from the three-month average looks the same
 * as one copied from the receipt, and whoever confirms without looking records an average
 * as if it were the money that went out.
 */
function sheetHelp(payment: PendingPayment | null): string | undefined {
  if (!payment) return undefined;
  if (payment.isMultiPayment) {
    return t('transactions.sheet.instalmentNote', { name: payment.name });
  }
  return payment.expectedAmount != null
    ? t('transactions.sheet.expectedNote', { name: payment.name })
    : t('transactions.sheet.attachNote', { name: payment.name });
}

interface MovementHeaderProps {
  mode: SheetMode;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * The same header as the other sheets, with the colored pastel in its slot.
 *
 * The type is in the TITLE and in the color, not in a pair of buttons inside the
 * form: the "Nuevo movimiento" menu picked it before opening this, so
 * here it is no longer a question —it is what is being talked about, and the pastel
 * says it before reading—.
 */
export function MovementHeader({ mode, onEdit, onDelete, onClose }: MovementHeaderProps) {
  const { type, isEditing, isEditable } = mode;

  return (
    <ModalHeader
      title={sheetTitle(mode)}
      description={sheetHelp(mode.isConfirming)}
      leading={
        <IconChip
          Icon={type === 'income' ? TrendingUp : TrendingDown}
          color={type === 'income' ? 'income' : 'expense'}
          size="sm"
        />
      }
      actions={
        <>
          {isEditing && !isEditable && (
            <Button
              type="button"
              variant="ghost"
              size="sm-icon"
              onClick={onEdit}
              aria-label={t('transactions.sheet.editMovement')}
              title={t('common.edit')}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
          )}

          {/*
            Also in static centers, and it is not an exception to the rule:
            the rule just never talked about this.

            What a static center protects is its STRUCTURE —which concepts
            exist and in which category they live—, and that is why it is not reclassified from
            here. A transaction is not structure: it is the record that such a month
            such money went out of a concept. Deleting it deletes the record and leaves the
            concept where it was, just as alive, ready for the next month.
          */}
          {isEditing && (
            <Button
              type="button"
              variant="ghost"
              size="sm-icon"
              onClick={onDelete}
              aria-label={t('transactions.sheet.deleteMovement')}
              title={t('common.delete')}
              /*
                The SAME color and the same size as the pencil and the X: dimming
                one of three says nothing, it says that one is half disabled.

                What does change is the HOVER, and it is the only exception: deleting is
                the only thing in this row that cannot be undone, and the red on
                hover is the last signal before the confirmation.
              */
              className="hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          )}
        </>
      }
      onClose={onClose}
    />
  );
}
