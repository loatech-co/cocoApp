import { spanish, SUGGESTION_REASON, type Spanish } from '../../common/vocabulary';
import type { Learning, Suggestion } from '../../modules/categorization/categorization.service';

export interface SuggestionV1 {
  category_id: number;
  confidence: number;
  reason: Spanish<typeof SUGGESTION_REASON, Suggestion['reason']>;
}

export interface LearningV1 {
  aprendido: boolean;
}

export function suggestionV1(s: Suggestion): SuggestionV1 {
  return {
    category_id: s.categoryId,
    confidence: s.confidence,
    reason: spanish(SUGGESTION_REASON, s.reason),
  };
}

export function learningV1(l: Learning): LearningV1 {
  return { aprendido: l.learned };
}
