import type { Learning, Suggestion } from '../../modules/categorization/categorization.service';

/** v2 bodies of the automatic classification (see `transactions.presenter.ts`). */

export function suggestionV2(suggestion: Suggestion): Suggestion {
  return suggestion;
}

export function learningV2(learning: Learning): Learning {
  return learning;
}
