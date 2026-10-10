/**
 * The two sections of My account that are reached by anchor.
 *
 * They were `#ajustes` and `#seguridad` until R2-B. The old anchors still
 * work, because bookmarks and pasted links carry them: the account page and
 * the legacy redirects both read them through `currentAccountHash`. They go
 * in the contraction (plan 8.7).
 */
export const ACCOUNT_SECTIONS = { settings: 'settings', security: 'security' } as const;

const LEGACY_HASHES: ReadonlyMap<string, string> = new Map([
  ['#ajustes', `#${ACCOUNT_SECTIONS.settings}`],
  ['#seguridad', `#${ACCOUNT_SECTIONS.security}`],
]);

/** The current anchor for `hash`: an old one is translated, anything else stays. */
export function currentAccountHash(hash: string): string {
  return LEGACY_HASHES.get(hash) ?? hash;
}
