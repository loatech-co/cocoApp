import type { IndexEntry } from '@coco/receipt-parser';

/**
 * The concepts someone used lately, for the blank search.
 *
 * From the most recent transactions —they already come sorted by date— the
 * distinct concepts are taken, in the order they appear, up to `max`. Only
 * concepts: a category picked in an old transaction is not «what I usually
 * use», it is a transaction that was left half classified.
 */
export function recentConcepts(
  transactions: readonly { categoryId: number | null }[] | undefined | null,
  index: readonly IndexEntry[],
  max = 5,
): number[] {
  // If the response is not a list —an old API, a wrapped error— there are no
  // recent ones, and that is it. The recent ones are a convenience: they cannot bring down the sheet.
  if (!isList(transactions)) return [];

  const concepts = new Set(index.filter((e) => e.level === 'concepto').map((e) => String(e.id)));
  const seen = new Set<number>();
  const output: number[] = [];

  for (const m of transactions) {
    if (m.categoryId === null) continue;
    if (!concepts.has(String(m.categoryId))) continue;
    if (seen.has(m.categoryId)) continue;
    seen.add(m.categoryId);
    output.push(m.categoryId);
    if (output.length >= max) break;
  }

  return output;
}

/**
 * A bare `Array.isArray` narrows a `readonly T[]` to `any[]`, and with that every
 * `categoryId` below becomes `any` for the lint. A predicate of our own
 * keeps the type.
 */
function isList(x: unknown): x is readonly { categoryId: number | null }[] {
  return Array.isArray(x);
}
