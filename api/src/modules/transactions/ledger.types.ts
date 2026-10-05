import type { Prisma, TransactionSource, TransactionType } from '../../generated/prisma/client';

import type { SplitToWrite } from './transactions.repository';
import type { Money } from '../../common/money/money';

/** A movement that might be the other side of the same payment. */
export interface DuplicateCandidateRow {
  id: bigint;
  source: TransactionSource;
  date: Date;
  amount: Prisma.Decimal;
  capturedAt: Date | null;
  createdAt: Date;
  rawText: string | null;
  merchant: string | null;
  description: string | null;
}

/** Misma persona, mismo monto, otro origen, cerca en fecha y en tiempo de captura. */
export interface DuplicateCriteria {
  userId: bigint;
  source: TransactionSource;
  amount: Money;
  days: { from: Date; to: Date };
  window: { from: Date; to: Date };
}

/** A movement of a range, with its splits, as the dashboard aggregates it. */
export interface SummaryMovement {
  date: Date;
  period: Date;
  type: TransactionType;
  amount: Prisma.Decimal;
  categoryId: bigint | null;
  splits: { categoryId: bigint | null; amount: Prisma.Decimal }[];
}

/** The dashboard filters, already resolved to category ids. */
export interface SummaryFilter {
  from: Date;
  to: Date;
  /** Only these categories (a requested branch), or every one when null. */
  branch: bigint[] | null;
  q: string | undefined;
  /** Categories whose NAME matches `q`, with their branch. */
  byName: bigint[];
}

/** Concept id → month (`YYYY-MM`) → what it cost that month. */
export type MonthlyHistory = Map<string, Map<string, Money>>;

/** The fields a duplicate capture may fill in on the movement it matched. */
type EnrichChanges = Partial<Record<'rawText' | 'merchant' | 'description', string | null>>;

/** A movement already validated by `TransactionsService.prepareNew`, ready to write. */
export interface NewTransaction {
  data: Prisma.TransactionUncheckedCreateInput & { userId: bigint };
  splits: SplitToWrite[];
  tagIds: bigint[];
}

/**
 * What a capture does once it has seen the candidates: fill in the movement
 * it matched, or be written (flagged for review when the match was partial).
 */
export type TwinVerdict =
  { kind: 'merge'; id: bigint; changes: EnrichChanges } | { kind: 'new'; flag: boolean };

/** Where a capture ended up: merged into an existing movement, or a new one. */
export interface CaptureOutcome {
  kind: 'merged' | 'created';
  id: bigint;
}

/** An automatic charge of a concept, ready to write. Always an expense, already cleared. */
export interface AutoCharge {
  userId: bigint;
  categoryId: bigint;
  date: Date;
  period: Date;
  amount: string;
  description: string;
  notes: string;
  externalRef: string;
}
