import type { PageMetaV2 } from './generated/model';

/** The largest page the v2 API serves (D9). */
const MAX_PER_PAGE = 200;

/**
 * Every page of a v2 list, for the screens that need the whole set: the
 * category tree, the accounts, the receipts of a transaction.
 *
 * Every v2 list is paginated, even the ones that are short by nature. One
 * page of 200 covers them today; the loop is there so that a person with more
 * does not see a tree cut in half without warning.
 */
export async function allPages<T>(
  fetchPage: (params: { page: number; perPage: number }) => Promise<{
    data: T[];
    meta: PageMetaV2;
  }>,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const { data, meta } = await fetchPage({ page, perPage: MAX_PER_PAGE });
    items.push(...data);
    if (data.length < MAX_PER_PAGE || items.length >= meta.total) return items;
  }
}

/**
 * What a PATCH may send. A `null` clears the field and the API accepts it
 * (`@IsOptional`), but the v2 document only says "optional": until it says
 * "nullable" too, the generated input type is widened here, in one place.
 */
export type Changes<T> = { [K in keyof T]?: T[K] | null };
