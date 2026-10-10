import { t } from '@/shared/lib/i18n';
/**
 * Where a transaction's classification came from, and who can change it.
 *
 * ── The four sources, from highest to lowest ────────────────────────────────
 * 1. What the person picks by hand.
 * 2. Their history: what the server suggests because that is how they classified it before.
 * 3. Their keywords: what they wrote on a concept to recognize it.
 * 4. The system dictionary: what we know about the country's merchants.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * A lower source NEVER replaces a higher one. Nothing automatic touches what was
 * picked by hand; a history suggestion can correct what
 * the dictionary set, but not the other way around. And a source can replace
 * itself: the history that changes its mind while typing is still
 * the history.
 *
 * It is a function and not an `if` in the sheet because the sources arrive through
 * different paths —a request, the reading of a receipt, a click— and each
 * path would have its own version of the rule. Here there is one.
 */
export type Origin = 'manual' | 'history' | 'keywords' | 'dictionary';

const RANK: Record<Origin, number> = {
  manual: 4,
  history: 3,
  keywords: 2,
  dictionary: 1,
};

export interface Classification {
  categoryId: number | undefined;
  /** `null` is «nobody has said anything yet». */
  origin: Origin | null;
}

export const UNCLASSIFIED: Classification = { categoryId: undefined, origin: null };

/** What a source proposes. It always says who it is. */
export interface Proposal {
  categoryId: number | undefined;
  origin: Origin;
}

/** What is left after a source proposes something. */
export function apply(actual: Classification, proposal: Proposal): Classification {
  if (proposal.origin === 'manual') return { ...proposal };
  if (actual.origin === 'manual') return actual;

  const currentRank = actual.origin === null ? 0 : RANK[actual.origin];
  return RANK[proposal.origin] >= currentRank ? { ...proposal } : actual;
}

/** To show it: «Sugerido por tu historial». */
export function originName(origin: Origin): string {
  switch (origin) {
    case 'manual':
      return 'elegido';
    case 'history':
      return t('transactions.classification.suggestedByHistory');
    case 'keywords':
      return t('transactions.classification.suggestedByKeywords');
    case 'dictionary':
      return t('transactions.classification.suggestedByMerchant');
  }
}
