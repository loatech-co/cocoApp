import { useEffect } from 'react';

import { selectedPath } from '@/features/transactions/model/transactions';
import { useCategories } from '@/shared/api/categories';

import { makeReceiptScan } from './receipt-scan';
import { useClassificationProposals } from './use-classification-proposals';
import { useMovementForm, type SheetOpening } from './use-movement-form';
import { useCreateInside, useSaveMovement } from './use-save-movement';

function useCloseOnEscape(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return;
    const onPress = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onPress);
    return () => document.removeEventListener('keydown', onPress);
  }, [isOpen, onClose]);
}

/**
 * Todo lo que la ficha de un movimiento necesita, junto.
 *
 * El estado vive en `useMovementForm`; lo que proponen las fuentes
 * automáticas, en `useClassificationProposals`; leer un recibo, en
 * `makeReceiptScan`; y guardar, en `useSaveMovement`.
 */
export function useMovementSheet(opening: SheetOpening & { onClose: () => void }) {
  const { isOpen, transaction, onClose } = opening;
  const categories = useCategories();
  const sheet = useMovementForm(opening);
  const recent = useClassificationProposals(sheet, {
    isOpen,
    transaction,
    tree: categories.data,
  });
  const save = useSaveMovement(sheet, transaction, onClose);
  const create = useCreateInside(sheet);
  useCloseOnEscape(isOpen, onClose);

  const tree = categories.data ?? [];
  /*
    ── Lo que ya está en un centro estático no se mueve ──────────────────────
    Estático es estático: ni desde la tabla ni desde aquí. La estructura de
    los costos fijos se decide una vez, y si de verdad hay que cambiarla, se
    hace dinámico el centro y entonces se mueve —que es un acto deliberado, en
    otra pantalla, y no un desplegable a un clic de distancia—.

    Se mira el centro GUARDADO, no el que esté elegido en el formulario. Con
    el elegido, escoger "Costos fijos" al crear un movimiento bloqueaba los dos
    desplegables de abajo y dejaba el formulario a medias: entrar sí se puede,
    salir es lo que no.
  */
  const isStatic =
    selectedPath(tree, transaction?.categoryId ?? undefined).costCenter?.isStatic ?? false;

  return {
    sheet,
    recent,
    scan: makeReceiptScan(sheet, categories.data),
    save,
    create,
    tree,
    isStatic,
  };
}

export type MovementSheet = ReturnType<typeof useMovementSheet>;
