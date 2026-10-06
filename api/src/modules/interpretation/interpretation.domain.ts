/** What the interpretation service hands out (the domain), and the pure helpers that build it. */
import type { InterpretedClassification, Interpreted } from './interpret';
import { CERTAINTY, CLASSIFICATION_SOURCE, english, type English } from '../../common/vocabulary';
import type { Transaction } from '../transactions/transactions.service';

export type Certainty = English<typeof CERTAINTY>;
export type ClassificationSource = English<typeof CLASSIFICATION_SOURCE>;

interface Candidate {
  id: bigint;
  name: string;
  /** Where it hangs, as the user reads it: `Center › Category › Concept`. */
  path: string;
}

/** The proposed classification, with the ids as the rest of the API knows them. */
export interface Classification {
  certainty: Certainty;
  source: ClassificationSource | null;
  conceptId: bigint | null;
  categoryId: bigint | null;
  name: string | null;
  candidates: Candidate[];
  /** Why, in Spanish: the client shows it as is. */
  reason: string;
}

export interface Interpretation {
  amount: string | null;
  date: string | null;
  merchant: string | null;
  description: string | null;
  classification: Classification;
  needsReview: boolean;
}

export interface Capture {
  transaction: Transaction;
  classification: Classification;
  /** One line for the notification, in Spanish. */
  summary: string;
  /** The `external_ref` was already captured: this is that transaction, unchanged. */
  isDuplicate: boolean;
  /** Merged into the other side of the same payment instead of creating a new one. */
  isMerged: boolean;
}

/**
 * What the person wrote, and under it the warning that the amount is missing.
 *
 * Wallet sometimes runs out of time and sends the transaction without a
 * value; the warning is what makes somebody fill in the figure. With a note
 * in between, neither of the two is lost.
 */
export function notesOf(note: string | undefined, amount: string | null): string | undefined {
  const parts = [
    note?.trim() || null,
    amount === null ? 'Capturado sin valor: hay que ponerlo.' : null,
  ].filter((p): p is string => p !== null);
  return parts.length === 0 ? undefined : parts.join('\n');
}

export function categoryIdToSave(c: InterpretedClassification): number | undefined {
  // High: the concept. Medium: the category, if any —flagged for review, but
  // already halfway in the right place—. None: nothing.
  const id =
    c.certainty === 'alta'
      ? (c.conceptId ?? c.categoryId)
      : c.certainty === 'media'
        ? c.categoryId
        : null;
  return id === null ? undefined : Number(id);
}

export function classificationOf(c: InterpretedClassification): Classification {
  return {
    certainty: english(CERTAINTY, c.certainty),
    source: c.source === null ? null : english(CLASSIFICATION_SOURCE, c.source),
    conceptId: c.conceptId === null ? null : BigInt(c.conceptId),
    categoryId: c.categoryId === null ? null : BigInt(c.categoryId),
    name: c.name,
    candidates: c.candidates.map((k) => ({ id: BigInt(k.id), name: k.name, path: k.path })),
    reason: c.reason,
  };
}

export function interpretationOf(i: Interpreted): Interpretation {
  return {
    amount: i.amount,
    date: i.date,
    merchant: i.merchant,
    description: i.description,
    classification: classificationOf(i.classification),
    needsReview: i.needsReview,
  };
}

export function todayInBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
