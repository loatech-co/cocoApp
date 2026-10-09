import { useDeleteReceipt } from '@/features/transactions/api/receipts';
import { DELETE_RECEIPT } from '@/features/transactions/model/receipts';
import { type Receipt } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { Confirmation } from '@/shared/ui/organisms/confirmation';

/**
 * The question before deleting a receipt: it is the only one of its controls that
 * cannot be undone.
 *
 * The transaction gallery and the full-screen lightbox ask it, with the
 * same words: it is the same action, done from another place. Open
 * while there is a `receipt`.
 */
export function ConfirmReceiptDeletion({
  transactionId,
  receipt,
  onCancel,
  onDeleted,
}: {
  transactionId: number;
  receipt: Receipt | null;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const remove = useDeleteReceipt(transactionId);

  return (
    <Confirmation
      isOpen={receipt !== null}
      title={t('transactions.supports.deleteTitle')}
      isDestructive
      confirmLabel={t('common.delete')}
      isBusy={remove.isPending}
      onCancel={onCancel}
      onConfirm={() => {
        if (!receipt) return;
        remove.mutate(receipt.id, { onSuccess: onDeleted });
      }}
    >
      {DELETE_RECEIPT}
    </Confirmation>
  );
}
