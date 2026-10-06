import type { FullTransaction } from './transactions.repository';
import { serialize, toMoney } from '../../common/money/money';
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

/**
 * A transaction as the service hands it out: the domain, not a wire format.
 *
 * The API turns it into its body (`presenters/v2`); the service does not
 * know the wire exists.
 */

interface Split {
  id: bigint;
  categoryId: bigint | null;
  amount: string;
  note: string | null;
}

export interface Transaction {
  id: bigint;
  uuid: string;
  accountId: bigint | null;
  /** `YYYY-MM-DD`. */
  date: string;
  /** The month the transaction BELONGS to, as its first day (`YYYY-MM-DD`). */
  period: string;
  amount: string;
  /** ISO 4217 code of `amount`. */
  currency: string;
  type: TransactionType;
  categoryId: bigint | null;
  description: string | null;
  merchant: string | null;
  notes: string | null;
  transferGroupId: string | null;
  transferDirection: 'out' | 'in' | null;
  externalRef: string | null;
  status: TransactionStatus;
  source: TransactionSource;
  rawText: string | null;
  capturedAt: Date | null;
  /** Someone has to look at it: an unsure classification or a possible duplicate. */
  needsReview: boolean;
  tags: string[];
  splits: Split[];
  createdAt: Date;
}

/** One page of transactions, with the totals of EVERY page that matches. */
export interface TransactionPage {
  data: Transaction[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    sumExpense: string;
    sumIncome: string;
  };
}

/** First and last period with transactions, `YYYY-MM-DD`; `null` when there are none. */
export interface TransactionHistory {
  first: string | null;
  last: string | null;
}

export interface Transfer {
  transferGroupId: string;
  /** The two legs: out of one account, into the other. */
  legs: Transaction[];
}

/** A row with its tags and splits, as the domain sees it. */
export function transactionFromRow(row: FullTransaction): Transaction {
  return {
    id: row.id,
    uuid: row.uuid,
    accountId: row.accountId,
    date: row.date.toISOString().slice(0, 10),
    period: row.period.toISOString().slice(0, 10),
    amount: serialize(toMoney(row.amount)),
    currency: row.currency,
    type: row.type,
    categoryId: row.categoryId,
    description: row.description,
    merchant: row.merchant,
    notes: row.notes,
    transferGroupId: row.transferGroupId,
    transferDirection: row.transferDir,
    externalRef: row.externalRef,
    status: row.status,
    source: row.source,
    rawText: row.rawText,
    capturedAt: row.capturedAt,
    needsReview: row.needsReview,
    tags: row.tags.map((link) => link.tag.name),
    splits: row.splits.map((split) => ({
      id: split.id,
      categoryId: split.categoryId,
      amount: serialize(toMoney(split.amount)),
      note: split.note,
    })),
    createdAt: row.createdAt,
  };
}
