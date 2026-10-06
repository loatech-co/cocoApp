import type {
  CreateTransactionDto,
  CreateTransferDto,
  ListTransactionsQueryDto,
  SplitDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import type {
  CreateTransactionInput,
  CreateTransferInput,
  ListTransactionsQuery,
  SplitInput,
  UpdateTransactionInput,
} from './dto/v2/transactions.dto';
import { defined, type V1Draft } from '../../contract/v2/v1-input';

/**
 * v2 inputs → the v1 DTOs the services take, field by field. Each object is
 * checked against its v1 DTO (`V1Draft`), so a misspelt v1 name does not
 * compile; an absent v2 field stays absent, never `undefined`.
 */

function split(input: SplitInput): SplitDto {
  return {
    ...defined<V1Draft<SplitDto>>({ category_id: input.categoryId, note: input.note }),
    amount: input.amount,
  };
}

/** The fields a transaction takes the same way created or edited. */
type Shared = Pick<
  CreateTransactionDto,
  | 'period'
  | 'raw_text'
  | 'captured_at'
  | 'por_revisar'
  | 'type'
  | 'status'
  | 'source'
  | 'merchant'
  | 'description'
  | 'notes'
  | 'tags'
  | 'splits'
>;

function shared(input: CreateTransactionInput | UpdateTransactionInput) {
  return defined<V1Draft<Shared>>({
    period: input.period,
    raw_text: input.rawText,
    captured_at: input.capturedAt,
    por_revisar: input.needsReview,
    type: input.type,
    status: input.status,
    source: input.source,
    merchant: input.merchant,
    description: input.description,
    notes: input.notes,
    tags: input.tags,
    splits: input.splits?.map(split),
  });
}

export function createTransaction(input: CreateTransactionInput): CreateTransactionDto {
  return {
    ...shared(input),
    ...defined<V1Draft<CreateTransactionDto>>({
      account_id: input.accountId,
      category_id: input.categoryId,
      external_ref: input.externalRef,
    }),
    date: input.date,
    amount: input.amount,
  };
}

export function updateTransaction(input: UpdateTransactionInput): UpdateTransactionDto {
  return {
    ...shared(input),
    ...defined<V1Draft<UpdateTransactionDto>>({
      date: input.date,
      amount: input.amount,
      account_id: input.accountId,
      category_id: input.categoryId,
    }),
  };
}

export function createTransfer(input: CreateTransferInput): CreateTransferDto {
  return {
    ...defined<V1Draft<CreateTransferDto>>({
      period: input.period,
      description: input.description,
    }),
    from_account_id: input.fromAccountId,
    to_account_id: input.toAccountId,
    date: input.date,
    amount: input.amount,
  };
}

/** v2 sort column → v1 sort column; the service keeps its own whitelist. */
function sort(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.replace(/createdAt$/, 'created_at');
}

export function listTransactions(query: ListTransactionsQuery): ListTransactionsQueryDto {
  return defined<V1Draft<ListTransactionsQueryDto>>({
    from: query.from,
    to: query.to,
    account_id: query.accountId,
    category_id: query.categoryId,
    category_ids: query.categoryIds,
    type: query.type,
    status: query.status,
    tag_id: query.tagId,
    q: query.q,
    min_amount: query.minAmount,
    max_amount: query.maxAmount,
    page: query.page,
    per_page: query.perPage,
    sort: sort(query.sort),
  });
}
