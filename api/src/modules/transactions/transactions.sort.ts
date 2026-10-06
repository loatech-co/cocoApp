import type { Prisma } from '../../generated/prisma/client';

/**
 * Allowlist of sortable fields.
 *
 * The client NEVER picks a column name freely, not even to sort: passing user
 * input to `orderBy` opens the door to leaking the shape of the schema and,
 * depending on the engine, to something worse. What is not in this table does
 * not exist.
 */
const SORTABLE_FIELDS = {
  date: 'date',
  amount: 'amount',
  createdAt: 'createdAt',
  merchant: 'merchant',
} as const satisfies Record<string, keyof Prisma.TransactionOrderByWithRelationInput>;

type SortableField = keyof typeof SORTABLE_FIELDS;

/** Default order: newest first, which is how a statement is read. */
const DEFAULT_ORDER: Prisma.TransactionOrderByWithRelationInput[] = [
  { date: 'desc' },
  { id: 'desc' },
];

/**
 * Turns `?sort=-date` into Prisma's `orderBy`.
 *
 * The `-` prefix means descending. An unknown field does not fail the
 * request: it is ignored and the default order is used — a misspelt
 * presentation parameter should not keep someone from seeing their
 * transactions.
 *
 * Always breaks ties by `id` so pagination is stable: without that tie-break,
 * two rows with the same date can swap pages between queries and the user
 * would see a transaction twice or miss another.
 */
export function parseOrder(sort?: string): Prisma.TransactionOrderByWithRelationInput[] {
  if (!sort) return DEFAULT_ORDER;

  const isDescending = sort.startsWith('-');
  const fieldName = isDescending ? sort.slice(1) : sort;

  if (!(fieldName in SORTABLE_FIELDS)) return DEFAULT_ORDER;

  const field = SORTABLE_FIELDS[fieldName as SortableField];
  const direction: Prisma.SortOrder = isDescending ? 'desc' : 'asc';

  return [{ [field]: direction }, { id: direction }];
}

export interface Pagination {
  page: number;
  perPage: number;
  skip: number;
  take: number;
}

const DEFAULT_PER_PAGE = 50;
export const MAX_PER_PAGE = 200;

export function parsePagination(page?: number, perPage?: number): Pagination {
  const safePage = Math.max(1, page ?? 1);
  const safePerPage = Math.min(MAX_PER_PAGE, Math.max(1, perPage ?? DEFAULT_PER_PAGE));

  return {
    page: safePage,
    perPage: safePerPage,
    skip: (safePage - 1) * safePerPage,
    take: safePerPage,
  };
}
