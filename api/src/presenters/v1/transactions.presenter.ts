import type {
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from '../../generated/prisma/client';
import type {
  Split,
  Transaction,
  TransactionPage,
  Transfer,
} from '../../modules/transactions/transactions.domain';

/** v1 body of a split. Field order is the wire order: v1 must not change a byte. */
interface SplitV1 {
  id: bigint;
  category_id: bigint | null;
  amount: string;
  note: string | null;
}

export interface TransactionV1 {
  id: bigint;
  uuid: string;
  account_id: bigint | null;
  date: string;
  period: string;
  amount: string;
  currency: string;
  type: TransactionType;
  category_id: bigint | null;
  description: string | null;
  merchant: string | null;
  notes: string | null;
  transfer_group_id: string | null;
  transfer_direction: 'out' | 'in' | null;
  external_ref: string | null;
  status: TransactionStatus;
  source: TransactionSource;
  raw_text: string | null;
  captured_at: Date | null;
  por_revisar: boolean;
  tags: string[];
  splits: SplitV1[];
  created_at: Date;
}

export interface TransactionPageV1 {
  data: TransactionV1[];
  meta: { page: number; per_page: number; total: number; sum_expense: string; sum_income: string };
}

export interface TransferV1 {
  transfer_group_id: string;
  legs: TransactionV1[];
}

function splitV1(split: Split): SplitV1 {
  return {
    id: split.id,
    category_id: split.categoryId,
    amount: split.amount,
    note: split.note,
  };
}

export function transactionV1(t: Transaction): TransactionV1 {
  return {
    id: t.id,
    uuid: t.uuid,
    account_id: t.accountId,
    date: t.date,
    period: t.period,
    amount: t.amount,
    currency: t.currency,
    type: t.type,
    category_id: t.categoryId,
    description: t.description,
    merchant: t.merchant,
    notes: t.notes,
    transfer_group_id: t.transferGroupId,
    transfer_direction: t.transferDirection,
    external_ref: t.externalRef,
    status: t.status,
    source: t.source,
    raw_text: t.rawText,
    captured_at: t.capturedAt,
    por_revisar: t.needsReview,
    tags: t.tags,
    splits: t.splits.map(splitV1),
    created_at: t.createdAt,
  };
}

export function transactionPageV1(page: TransactionPage): TransactionPageV1 {
  const { meta } = page;
  return {
    data: page.data.map(transactionV1),
    meta: {
      page: meta.page,
      per_page: meta.perPage,
      total: meta.total,
      sum_expense: meta.sumExpense,
      sum_income: meta.sumIncome,
    },
  };
}

export function transferV1(transfer: Transfer): TransferV1 {
  return { transfer_group_id: transfer.transferGroupId, legs: transfer.legs.map(transactionV1) };
}
