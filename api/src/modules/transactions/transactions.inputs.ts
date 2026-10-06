/**
 * What the transactions service is asked to do, in the domain's words: the
 * inputs. Apart from `transactions.domain.ts` (what it hands out) because the
 * repository reads the filters and the domain reads the repository's rows.
 */
import type {
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from '../../generated/prisma/client';

/** One part of a split: a slice of the amount, in a concept or unclassified. */
export interface SplitRequest {
  categoryId?: number | undefined;
  /** Decimal string. */
  amount: string;
  note?: string | undefined;
}

/** What a transaction is written with, created or edited. Money as decimal strings. */
interface TransactionFields {
  /** `YYYY-MM`, when the money belongs to another month than its date. */
  period?: string | undefined;
  type?: TransactionType | undefined;
  description?: string | undefined;
  merchant?: string | undefined;
  notes?: string | undefined;
  status?: TransactionStatus | undefined;
  source?: TransactionSource | undefined;
  rawText?: string | null | undefined;
  /** ISO 8601. */
  capturedAt?: string | null | undefined;
  needsReview?: boolean | undefined;
  /** Tag names; the missing ones are created. */
  tags?: string[] | undefined;
  splits?: SplitRequest[] | undefined;
}

/** A new transaction. */
export interface TransactionRequest extends TransactionFields {
  accountId?: number | undefined;
  /** `YYYY-MM-DD`. */
  date: string;
  amount: string;
  categoryId?: number | undefined;
  /** The idempotency key of a capture. */
  externalRef?: string | undefined;
}

/** What an edit changes: only the fields it brings. `categoryId: null` clears it. */
export interface TransactionEdit extends TransactionFields {
  accountId?: number | undefined;
  date?: string | undefined;
  amount?: string | undefined;
  categoryId?: number | null | undefined;
}

/** A transfer between two of the person's accounts. */
export interface TransferRequest {
  period?: string | undefined;
  fromAccountId: number;
  toAccountId: number;
  date: string;
  amount: string;
  description?: string | undefined;
}

/** Which transactions to list, and which page of them. */
export interface TransactionFilters {
  from?: string | undefined;
  to?: string | undefined;
  accountId?: number | undefined;
  categoryId?: number | undefined;
  /** Comma-separated ids. */
  categoryIds?: string | undefined;
  type?: TransactionType | undefined;
  status?: TransactionStatus | undefined;
  tagId?: number | undefined;
  q?: string | undefined;
  minAmount?: string | undefined;
  maxAmount?: string | undefined;
  page?: number | undefined;
  perPage?: number | undefined;
  /** A sortable field, `-` in front for descending: `-date`, `amount`, `createdAt`. */
  sort?: string | undefined;
}
