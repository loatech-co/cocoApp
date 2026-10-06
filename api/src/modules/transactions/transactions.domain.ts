import type { TransaccionCompleta } from './transactions.repository';
import { serializar, toMoney } from '../../common/money/money';
import type {
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from '../../generated/prisma/client';

/**
 * A transaction as the service hands it out: the domain, not a wire format.
 *
 * Each API version turns it into its own body (`presenters/v1`,
 * `presenters/v2`); the service does not know either exists.
 */

export interface Split {
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
export function transactionFromRow(row: TransaccionCompleta): Transaction {
  return {
    id: row.id,
    uuid: row.uuid,
    accountId: row.accountId,
    date: row.date.toISOString().slice(0, 10),
    period: row.period.toISOString().slice(0, 10),
    amount: serializar(toMoney(row.amount)),
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
      amount: serializar(toMoney(split.amount)),
      note: split.note,
    })),
    createdAt: row.createdAt,
  };
}
