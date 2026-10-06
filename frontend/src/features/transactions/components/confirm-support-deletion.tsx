import { useDeleteReceipt } from '@/features/transactions/api/receipts';
import { DELETE_RECEIPT } from '@/features/transactions/model/supports';
import { type Receipt } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { Confirmation } from '@/shared/ui/organisms/confirmation';

/**
 * La pregunta antes de borrar un soporte: es lo único de sus mandos que no se
 * puede deshacer.
 *
 * La hacen la galería de un movimiento y el pase a pantalla completa, con las
 * mismas palabras: es la misma acción, hecha desde otro sitio. Abierta
 * mientras haya un `soporte`.
 */
export function ConfirmSupportDeletion({
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
