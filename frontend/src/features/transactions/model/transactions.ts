import { type CategoryTree } from '@/shared/api/categories';
import { type Transaction, type TransactionType } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import type { MoneyDirection } from '@/shared/ui/atoms/amount';

/**
 * What a transaction IS, and where it gets its name from.
 *
 * ── A transaction is a RECORD ───────────────────────────────────────────────
 * It is not a thing with a name of its own: it is the note that on such a day such
 * money went out of such a concept. It does not have the name, it TAKES it from the concept it
 * belongs to.
 *
 * ── Why it is derived and not stored ────────────────────────────────────────
 * Because if a copy were stored, renaming a concept would leave its
 * transactions behind: «Aseo» would become «Aseo y limpieza» in Centros de
 * costos and in the table the forty old ones would still say «Aseo». Two
 * names for the same thing, and no way of knowing which one is right.
 *
 * Deriving it, renaming the concept renames its transactions, which is
 * exactly what it means for the name to belong to the concept.
 *
 * ── And the concept does NOT go with the transaction ────────────────────────
 * Deleting a transaction deletes the record and nothing else: the concept stays alive,
 * because it is structure and not data. It is the reason why neither concepts nor
 * categories nor centers can be touched from here —only from Centros de
 * costos—: from the transactions table you note down and correct what happened,
 * you do not redo the map it is sorted by.
 */

/**
 * Rebuilds the whole path from a single id.
 *
 * Filters and transactions store ONE id —the most specific one that was
 * picked—, not all three. Storing the three would force keeping them consistent
 * with each other on every change, and a single slip would be enough to have a category that does not
 * belong to the selected center. With just one, the rest is deduced and cannot
 * contradict itself.
 */
export function selectedPath(
  tree: CategoryTree[],
  categoryId?: number,
): { costCenter?: CategoryTree; category?: CategoryTree; concept?: CategoryTree } {
  if (categoryId === undefined) return {};

  for (const costCenter of tree) {
    if (costCenter.id === categoryId) return { costCenter };

    for (const category of costCenter.children ?? []) {
      if (category.id === categoryId) return { costCenter, category };

      for (const concept of category.children ?? []) {
        if (concept.id === categoryId) return { costCenter, category, concept };
      }
    }
  }

  return {};
}

/**
 * The name of a transaction.
 *
 * That of the concept it belongs to. If it is only classified down to the category,
 * that of the category: it is the most specific thing known about it.
 *
 * ── The two fallbacks, and why they exist ───────────────────────────────────
 * `description` and `merchant` are what THE PAPER SAID, not the name of the
 * transaction: an import fills them with what the statement carried, and an
 * imported and still unclassified transaction has no concept to
 * take a name from. There «PAGO PSE COMCEL» is much better than «Sin concepto»,
 * because it is exactly the fact someone is going to use to decide where to classify it.
 *
 * They go AFTER the concept and not before. The other way around —which is how it was— a
 * transaction created by hand was left without a name: the sheet redesign
 * swapped the free «Concepto» field for a concept selector, so
 * `description` stopped being filled by any visible path and the table, which
 * painted `description`, said «Sin concepto» of everything recorded by
 * hand even though it had its concept picked.
 */
export function transactionName(
  transaction: Pick<Transaction, 'description' | 'merchant' | 'categoryId'>,
  tree: CategoryTree[],
): string {
  const { category, concept } = selectedPath(tree, transaction.categoryId ?? undefined);

  return (
    concept?.name ??
    category?.name ??
    transaction.description ??
    transaction.merchant ??
    t('transactions.noConcept')
  );
}

/** Which way a transaction's money goes, in the language of `Amount`. */
export function transactionDirection(type: TransactionType): MoneyDirection {
  if (type === 'income') return 'in';
  if (type === 'transfer') return 'transfer';
  return 'out';
}
