import { DEFAULT_PER_PAGE, type PageQuery } from './page.dto';

/** A v2 list: `{ data, meta: { page, perPage, total } }` (D9). */
export interface Page<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number };
}

/**
 * One page of a list the service returns whole.
 *
 * Most lists here are small and per user (accounts, tags, a transaction's
 * receipts, the cost centers), so the service reads them in one query and the
 * page is cut here. The transactions and the admin lists are paged by their
 * services, in SQL.
 */
export function paginate<T>(items: readonly T[], query: PageQuery): Page<T> {
  const page = query.page ?? 1;
  const perPage = query.perPage ?? DEFAULT_PER_PAGE;
  const start = (page - 1) * perPage;
  return {
    data: items.slice(start, start + perPage),
    meta: { page, perPage, total: items.length },
  };
}
