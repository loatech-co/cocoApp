/**
 * `meta` of every v2 list (D9): lists go one page at a time, numbered, so a
 * client can jump to page five of eight. Defined once; every list uses it.
 */
export class PageMetaV2 {
  /** 1-based page number. */
  page!: number;
  /** Items per page, 1–200. */
  perPage!: number;
  /** Items across every page. */
  total!: number;
}
