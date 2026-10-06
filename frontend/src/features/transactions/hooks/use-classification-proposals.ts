import { useMemo } from 'react';

import { useTransactions } from '@/features/transactions/api/transactions';
import { useCategorySuggestion } from '@/features/transactions/hooks/use-category-suggestion';
import { proposalFromText } from '@/features/transactions/model/movement-form';
import { recentConcepts } from '@/features/transactions/model/recent';
import { type Category, type Transaction } from '@/shared/api/generated/model';
import { useOnChange } from '@/shared/lib/on-change';
import { toSearchableNodes } from '@/shared/lib/searchable-tree';
import { indexTree } from '@coco/receipt-parser';

import type { MovementSheetState } from './use-movement-form';

/**
 * Las fuentes automáticas de la clasificación, y los conceptos recientes.
 *
 * ── Las fuentes ─────────────────────────────────────────────────────────────
 * Tres, y las tres pasan por `proponer`, que aplica la precedencia:
 *
 * · El HISTORIAL, que vive en el servidor: `/categorization/suggest` con lo
 *   que se está escribiendo (con espera entre teclas; ver el hook).
 * · Las PALABRAS CLAVE y los nombres de la persona: lo escrito se busca en su
 *   árbol; si lleva a un solo concepto, se propone.
 * · El DICCIONARIO del sistema: si lo escrito nombra un comercio conocido, sus
 *   términos se buscan en el árbol. Ver `proposalFromText`.
 *
 * Solo con la ficha en el formulario y editable: proponer sobre una ficha de
 * solo lectura sería cambiarle la clasificación a un movimiento guardado.
 *
 * ── La recurrencia NO se edita aquí ─────────────────────────────────────────
 * Es del CONCEPTO, no del movimiento, y su sitio es Centros de costos. Editable
 * desde la ficha, un formulario que uno abre para corregir una cifra podía
 * cambiar cada cuánto vuelve un pago, y eso reaparece semanas después en la
 * tarjeta de pagos pendientes sin que nadie recuerde haberlo tocado.
 */
export function useClassificationProposals(
  sheet: MovementSheetState,
  {
    isOpen,
    transaction,
    tree,
  }: {
    isOpen: boolean;
    transaction: Transaction | null | undefined;
    tree: Category[] | undefined;
  },
) {
  const treeIndex = useMemo(() => indexTree(toSearchableNodes(tree ?? [])), [tree]);
  const isProposing = isOpen && sheet.step === 'formulario' && sheet.isEditable;

  const historySuggestion = useCategorySuggestion(isProposing ? sheet.description : '');
  useOnChange([historySuggestion?.categoryId], () => {
    // Solo con un id de verdad: una respuesta con otra forma no puede vaciar
    // lo que otra fuente ya había puesto.
    if (typeof historySuggestion?.categoryId !== 'number') return;
    sheet.setWasSuggested(true);
    sheet.propose({ categoryId: historySuggestion.categoryId, origin: 'historial' });
  });

  const localProposal = useMemo(() => {
    const written = sheet.description.trim();
    if (!isProposing || written.length < 3) return null;
    return proposalFromText(treeIndex, written);
  }, [treeIndex, sheet.description, isProposing]);

  useOnChange(
    [
      localProposal?.categoryId,
      localProposal?.origin,
      localProposal && (localProposal.candidates ?? []).map((c) => c.id).join(','),
    ],
    () => {
      if (!localProposal) return;
      sheet.setWasSuggested(true);
      const { categoryId, origin, candidates } = localProposal;
      if (categoryId !== undefined) sheet.propose({ categoryId, origin });
      if (candidates) sheet.setReceiptCandidates(candidates);
    },
  );

  // Los conceptos usados últimamente, para el buscador en blanco. Solo al
  // crear: editando, el concepto ya está puesto.
  const recentTransactions = useTransactions({ perPage: 40 }, { enabled: isOpen && !transaction });
  return useMemo(
    () => recentConcepts(recentTransactions.data?.data ?? [], treeIndex),
    [recentTransactions.data, treeIndex],
  );
}
