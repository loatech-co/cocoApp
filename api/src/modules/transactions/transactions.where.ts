import type { Prisma } from '../../generated/prisma/client';

/**
 * ── One condition for "belongs to these concepts" ────────────────────────────
 * A row belongs to a concept through its own category or through one of its
 * splits: a split payment is still a payment of that concept. The list, the
 * search by category name and the dashboard all read THIS condition. Until
 * R5-A (A2) the list looked at the header alone while the dashboard also
 * looked at the splits, so the same filter gave two different figures.
 */
export function inConcepts(categoryIds: readonly bigint[]): Prisma.TransactionWhereInput {
  const ids = [...categoryIds];
  return { OR: [{ categoryId: { in: ids } }, { splits: { some: { categoryId: { in: ids } } } }] };
}
