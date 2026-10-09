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
 * Everything a transaction's sheet needs, together.
 *
 * The state lives in `useMovementForm`; what the automatic sources
 * propose, in `useClassificationProposals`; reading a receipt, in
 * `makeReceiptScan`; and saving, in `useSaveMovement`.
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
    ── What is already in a static center does not move ──────────────────────
    Static is static: not from the table and not from here. The structure of
    fixed costs is decided once, and if it really has to change, the
    center is made dynamic and then it is moved —which is a deliberate act, on
    another screen, and not a dropdown one click away—.

    The SAVED center is checked, not the one picked in the form. With
    the picked one, choosing "Costos fijos" when creating a transaction locked the two
    dropdowns below and left the form half done: getting in is allowed,
    getting out is what is not.
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
