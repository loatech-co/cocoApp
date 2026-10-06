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
  /** El pago que se viene a confirmar, solo si la ficha no es de un movimiento ya guardado. */
  isConfirming: PendingPayment | null;
}

/**
 * Lo que se va a hacer no es lo mismo, así que no se llama igual. «Confirmar
 * pago» en un concepto que se cubre a pedazos promete cerrar el mes, y lo que
 * se anota es una ida de cuatro: la lista ya ofreció «Registrar otro» y la
 * ficha que se abre tiene que ser la que se pidió.
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
 * Solo al confirmar un pago, y dice las tres cosas que hacen falta: CUÁL es el
 * pago —el título no lo dice—, que lo que hay escrito es un esperado y no un
 * dato, y qué hacer para que deje de serlo.
 *
 * Sin la segunda, un valor calculado del promedio de tres meses se ve igual
 * que uno copiado del recibo, y el que confirme sin mirar registra un promedio
 * como si fuera la plata que salió.
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
 * La misma cabecera que las demás fichas, con el pastel de color en su hueco.
 *
 * El tipo está en el TÍTULO y en el color, no en un par de botones dentro del
 * formulario: lo eligió el menú de "Nuevo movimiento" antes de abrir esto, así
 * que aquí ya no es una pregunta —es de qué se está hablando, y el pastel lo
 * dice antes de leer—.
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
            También en los centros estáticos, y no es una excepción a la regla:
            es que la regla nunca hablaba de esto.

            Lo que un centro estático protege es su ESTRUCTURA —qué conceptos
            existen y en qué categoría viven—, y por eso no se reclasifica desde
            aquí. Un movimiento no es estructura: es el registro de que tal mes
            salió tal plata de un concepto. Borrarlo borra el registro y deja el
            concepto donde estaba, igual de vivo, listo para el mes siguiente.
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
                El MISMO color y el mismo tamaño que el lápiz y la equis: apagar
                uno de tres no dice nada, dice que ese está medio deshabilitado.

                Lo que sí cambia es el HOVER, y es la única excepción: borrar es
                lo único de esta fila que no se puede deshacer, y el rojo al
                pasar por encima es la última señal antes de la confirmación.
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
