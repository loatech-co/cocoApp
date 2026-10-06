/**
 * Inputs built field by field on their way to a service.
 */

/**
 * An input under construction: every field may still be `undefined`. Passed
 * to `defined` as its type argument, it turns on the excess-property check,
 * so a misspelt field does not compile.
 */
export type Draft<T> = { [K in keyof T]?: T[K] | undefined };

/**
 * Copies the keys whose value is not `undefined`.
 *
 * The services tell "not sent" from "sent as null" (`categoryId: null`
 * clears the category; absent leaves it). Writing `key: undefined` for every
 * absent field would blur that.
 */
export function defined<T extends Record<string, unknown>>(
  object: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
