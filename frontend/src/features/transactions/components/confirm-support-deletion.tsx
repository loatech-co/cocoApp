import { useEliminarSoporte } from '@/features/transactions/api/soportes';
import { BORRAR_UN_SOPORTE } from '@/features/transactions/model/supports';
import { type Receipt } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { Confirmacion } from '@/shared/ui/organisms/confirmacion';

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
  soporte,
  onCancelar,
  onBorrado,
}: {
  transactionId: number;
  soporte: Receipt | null;
  onCancelar: () => void;
  onBorrado: () => void;
}) {
  const eliminar = useEliminarSoporte(transactionId);

  return (
    <Confirmacion
      abierta={soporte !== null}
      titulo={t('transactions.supports.deleteTitle')}
      peligrosa
      etiquetaConfirmar={t('common.delete')}
      ocupada={eliminar.isPending}
      onCancelar={onCancelar}
      onConfirmar={() => {
        if (!soporte) return;
        eliminar.mutate(soporte.id, { onSuccess: onBorrado });
      }}
    >
      {BORRAR_UN_SOPORTE}
    </Confirmacion>
  );
}
