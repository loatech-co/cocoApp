import { isFlagName, type FlagName } from './registry';

/**
 * How the two sources spell a flag. Shared so the API (which reads them) and
 * the environment check (which validates them at boot) cannot disagree.
 */

/** The `user_preferences.pref_key` that holds a per-user value. */
export const PREFERENCE_PREFIX = 'feature:';

export function preferenceKey(name: FlagName): string {
  return `${PREFERENCE_PREFIX}${name}`;
}

/** The flag a preference key refers to, or `null` if it is not a known flag. */
export function flagOfPreferenceKey(key: string): FlagName | null {
  if (!key.startsWith(PREFERENCE_PREFIX)) return null;
  const name = key.slice(PREFERENCE_PREFIX.length);
  return isFlagName(name) ? name : null;
}

export interface ParsedFeatures {
  /** Registered flags turned on for every user. */
  readonly names: readonly FlagName[];
  /** Names that are not in the registry: a typo or a flag already removed. */
  readonly unknown: readonly string[];
}

/**
 * `FEATURES=flag_a, flag_b` → the flags it turns on.
 *
 * Unknown names are returned, not dropped: the API refuses to start with one,
 * because a typo would otherwise leave a flag silently off in production.
 */
export function parseFeatures(raw: string | undefined): ParsedFeatures {
  const names = new Set<FlagName>();
  const unknown: string[] = [];
  for (const part of (raw ?? '').split(',')) {
    const name = part.trim();
    if (name === '') continue;
    if (isFlagName(name)) names.add(name);
    else unknown.push(name);
  }
  return { names: [...names], unknown };
}
