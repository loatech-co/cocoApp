import { useMemo } from 'react';

import { useTransactions } from '@/features/transactions/api/transactions';
import { useCategorySuggestion } from '@/features/transactions/hooks/use-category-suggestion';
import { recentConcepts } from '@/features/transactions/model/recent';
import { proposalFromText } from '@/features/transactions/model/transaction-form';
import { type Category, type Transaction } from '@/shared/api/generated/model';
import { useOnChange } from '@/shared/lib/on-change';
import { toSearchableNodes } from '@/shared/lib/searchable-tree';
import { indexTree } from '@coco/receipt-parser';

import type { TransactionSheetState } from './use-transaction-form';

/**
 * The automatic sources of the classification, and the recent concepts.
 *
 * ── The sources ─────────────────────────────────────────────────────────────
 * Three, and all three go through `propose`, which applies the precedence:
 *
 * · The HISTORY, which lives on the server: `/categorization/suggest` with what
 *   is being typed (with a wait between keys; see the hook).
 * · The person's KEYWORDS and names: what was typed is searched in their
 *   tree; if it leads to a single concept, it is proposed.
 * · The system DICTIONARY: if what was typed names a known merchant, its
 *   terms are searched in the tree. See `proposalFromText`.
 *
 * Only with the sheet in the form and editable: proposing on a
 * read-only sheet would change the classification of a saved transaction.
 *
 * ── Recurrence is NOT edited here ───────────────────────────────────────────
 * It belongs to the CONCEPT, not the transaction, and its place is Centros de costos. Editable
 * from the sheet, a form you open to correct an amount could
 * change how often a payment comes back, and that shows up weeks later in the
 * pending payments card without anyone remembering touching it.
 */
export function useClassificationProposals(
  sheet: TransactionSheetState,
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
    // Only with a real id: a response with another shape cannot empty
    // what another source had already set.
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

  // The concepts used lately, for the blank search. Only when
  // creating: when editing, the concept is already set.
  const recentTransactions = useTransactions({ perPage: 40 }, { enabled: isOpen && !transaction });
  return useMemo(
    () => recentConcepts(recentTransactions.data?.data ?? [], treeIndex),
    [recentTransactions.data, treeIndex],
  );
}
