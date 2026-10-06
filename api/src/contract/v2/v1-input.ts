/**
 * Inputs built field by field on their way to a service.
 *
 * Where a service still takes the v1 DTOs, the v2 controller (or its mapper)
 * builds the v1 DTO with these two helpers, and the literals go back to
 * Spanish with `spanish()` from `common/vocabulary.ts`. Where the service
 * already speaks English (categories, since 7.2-e), both controllers build its
 * input with them.
 */

/**
 * A v1 DTO under construction: every field may still be `undefined`. Passed
 * to `defined` as its type argument, it turns on the excess-property check,
 * so a misspelt v1 field does not compile.
 */
export type V1Draft<T> = { [K in keyof T]?: T[K] | undefined };

/**
 * Copies the keys whose value is not `undefined`.
 *
 * A v2 input becomes a v1 DTO for the service, and the services tell "not
 * sent" from "sent as null" (`category_id: null` clears the category; absent
 * leaves it). Writing `key: undefined` for every absent field would blur that.
 */
export function defined<T extends Record<string, unknown>>(
  object: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
