import { type CategoryTree } from '@/shared/api/categories';
import {
  type PendingPayment,
  type Transaction,
  type TransactionType,
} from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import {
  searchInTree,
  normalize,
  resolveTerms,
  termsFor,
  type IndexEntry,
  type Reading,
} from '@coco/receipt-parser';

import type { Origin } from './precedence';

/** A concept the reading left to choose between, for the search. */
export interface ReceiptCandidate {
  id: number;
  name: string;
  path: string;
}

/**
 * What an automatic source proposes for classifying.
 *
 * `candidates`, when it comes, REPLACES the ones the search had in view;
 * without it, the ones there were stay.
 */
export interface AutoProposal {
  categoryId: number | undefined;
  origin: Origin;
  candidates?: ReceiptCandidate[];
}

export function todayInBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** `expense` → "gasto". The type, said the way it is said. */
export function typeName(type: TransactionType): string {
  return type === 'income'
    ? t('transactions.types.incomeNoun')
    : t('transactions.types.expenseNoun');
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The amount and the date the sheet is born with.
 *
 * When confirming a payment, they are born set. They are the EXPECTED: the average of the
 * months that were paid and the day it was due. They are not the good fact —the
 * good fact is what the receipt says— but they are much better than an empty box, and the
 * gesture that corrects them is attaching the receipt, which is what you come for.
 *
 * An expected amount nobody corrects gets recorded as if it were the real one, and that is
 * why the header says so in so many words instead of letting it look like a
 * fact.
 *
 * ── What is covered in pieces comes in EMPTY, and with today's date ─────────
 * A regular concept is confirmed: what it is expected to cost is what it is going to
 * cost, and bringing it written saves the step. One paid in several installments is not
 * confirmed, it is PAID DOWN: what the head of whoever opens this sheet carries is
 * what they just spent at the supermarket, and the month total has nothing to
 * do with that.
 *
 * Putting 1,200,000 there —the whole budget— would be the worst possible
 * suggestion: at the first «guardar» without looking, the month is covered at once and the
 * concept leaves the list as if it were already settled.
 *
 * And the date is TODAY and not the due date, for the same reason: the trip to the market was
 * today. Day 1 is when the cycle starts counting, not when this was spent.
 */
export function initialAmountAndDate(
  transaction: Transaction | null | undefined,
  payment: PendingPayment | null | undefined,
): { amount: string; date: string } {
  const isPayingIntoConcept = payment?.isMultiPayment === true;

  return {
    amount: transaction
      ? String(Number(transaction.amount))
      : !isPayingIntoConcept && payment?.expectedAmount != null
        ? String(Number(payment.expectedAmount))
        : '',
    date:
      transaction?.date ??
      (isPayingIntoConcept ? todayInBogota() : (payment?.dueDate ?? todayInBogota())),
  };
}

/**
 * Looks up a concept by its name in the tree.
 *
 * Ignoring capitals and accents: what the classifier returns comes
 * from a hand-written signature table, and what is in the tree was written by
 * a person. "Celsia (Energia)" and "Celsia (Energía)" are the same concept and
 * there is no reason for an accent to split them.
 */
function conceptNamed(tree: CategoryTree[], name: string): CategoryTree | undefined {
  const wanted = normalize(name);

  for (const costCenter of tree) {
    for (const category of costCenter.children ?? []) {
      for (const concept of category.children ?? []) {
        if (normalize(concept.name) === wanted) return concept;
      }
    }
  }
  return undefined;
}

/**
 * What the TYPED text proposes: the person's keywords and names in
 * their tree, and if not, the system dictionary.
 *
 * If it leads to a single concept, it is proposed. If the dictionary leads to a
 * category or to several concepts, the category is proposed and the candidates
 * stay in view in the search.
 */
export function proposalFromText(
  index: readonly IndexEntry[],
  written: string,
): AutoProposal | null {
  const concepts = searchInTree(index, written).filter((e) => e.level === 'concepto');
  const [single] = concepts;
  if (concepts.length === 1 && single !== undefined) {
    return { categoryId: Number(single.id), origin: 'palabras-clave' };
  }

  const terms = termsFor(written);
  if (terms.length === 0) return null;
  const resolved = resolveTerms(index, terms);
  if (resolved.certainty === 'alta' && resolved.concept) {
    return { categoryId: Number(resolved.concept.id), origin: 'diccionario' };
  }
  if (resolved.certainty === 'media') {
    const candidates = resolved.candidates.map((c) => ({
      id: Number(c.id),
      name: c.name,
      path: c.path.join(' › '),
    }));
    return {
      categoryId: resolved.category ? Number(resolved.category.id) : undefined,
      origin: 'diccionario',
      // From the text, they are only put in view if there is any.
      ...(candidates.length > 0 ? { candidates } : {}),
    };
  }
  return null;
}

/**
 * What the receipt says about the classification, by its source and its certainty.
 *
 * With ids when there are any —`inTree`—: high proposes the concept; medium
 * proposes the category, if there is one, and leaves the candidates in view in the
 * search for the person to pick. It never guesses among several.
 *
 * The person's keywords and the catalog go with keyword
 * rank; the dictionary, with its own. Without ids —a tree that did not arrive—, by
 * name, as always. `null` if the receipt said nothing about this.
 */
export function proposalFromReading(reading: Reading, tree: CategoryTree[]): AutoProposal | null {
  const inTree = reading.inTree;
  if (!inTree) {
    const own = reading.concept ? conceptNamed(tree, reading.concept) : undefined;
    return own ? { categoryId: own.id, origin: 'palabras-clave' } : null;
  }

  const origin: Origin =
    inTree.source === 'diccionario'
      ? 'diccionario'
      : inTree.source === 'historial'
        ? 'historial'
        : 'palabras-clave';

  if (inTree.certainty === 'alta' && inTree.conceptId !== undefined) {
    return { categoryId: Number(inTree.conceptId), origin };
  }
  if (inTree.certainty === 'media') {
    return {
      categoryId: inTree.categoryId !== undefined ? Number(inTree.categoryId) : undefined,
      origin,
      candidates: inTree.candidates.map((c) => ({
        id: Number(c.id),
        name: c.name,
        path: c.path,
      })),
    };
  }
  // There was a reading in the tree, even though it was not enough to propose anything.
  return { categoryId: undefined, origin };
}

/**
 * What to say when reading extracted nothing useful, or `null` if it did extract something.
 *
 * ── Reading and extracting nothing is NOT having read ───────────────────────
 * Before, «Los datos se extrajeron del soporte» was announced no matter
 * what, even with all three fields empty. And there are two ways of extracting
 * nothing, which are not fixed the same way:
 *
 * · No TEXT could be extracted from the file —a PDF that does not open, an image that
 *   recognition cannot decipher—. There is nothing to review there.
 * · The text was extracted but neither amount nor date nor concept was recognized. There
 *   the document was read; what did not fit is its shape.
 *
 * In both cases the file stays attached: it was uploaded to keep it, not
 * only to read it.
 */
export function unreadNotice(reading: Reading, text: string): string | null {
  const hasSomethingUseful =
    reading.value !== null || reading.date !== null || reading.concept !== null;
  if (hasSomethingUseful) return null;
  return text.trim() === ''
    ? t('transactions.reading.noText')
    : t('transactions.reading.noAmountNorDate');
}
