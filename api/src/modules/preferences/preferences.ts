/**
 * User preferences — catalogue and pure logic.
 *
 * ── Why there is a closed catalogue ──────────────────────────────────────────
 * `user_preferences` is a key-value table with `pref_value` in JSON, so it
 * technically takes anything. Without a catalogue, in six months there would
 * be keys spelled three different ways and values of unexpected types failing
 * in production. This declares which preferences exist, their type and their
 * value when nobody has touched them.
 *
 * The default is decided ONCE, here. If it were spread across the services,
 * one module would read `false` where another reads `true`.
 */

/**
 * Keeping accounts —cards, savings, cash— is OFF by default.
 *
 * It is the product decision that orders everything else: recording an
 * expense cannot require having made up an account first. Whoever wants to
 * follow balances switches it on; for everyone else, accounts simply do not
 * exist. The key is the stored one (`pref_key`).
 */
export const ACCOUNTS_ENABLED = 'cuentas_habilitadas';

export interface StoredPreferences {
  [ACCOUNTS_ENABLED]: boolean;
}

export const DEFAULT_PREFERENCES: Readonly<StoredPreferences> = Object.freeze({
  [ACCOUNTS_ENABLED]: false,
});

export type PreferenceKey = keyof StoredPreferences;

export const KEYS: readonly PreferenceKey[] = Object.keys(DEFAULT_PREFERENCES) as PreferenceKey[];

export function isKnownKey(key: string): key is PreferenceKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_PREFERENCES, key);
}

/**
 * Merges what is stored with the defaults.
 *
 * Tolerant on purpose: a row with a key that no longer exists, or with a value
 * of the wrong type, is IGNORED instead of failing the request. These are
 * interface preferences — one badly stored cannot stop anybody from seeing
 * their finances.
 */
export function withDefaults(
  saved: readonly { prefKey: string; prefValue: unknown }[],
): StoredPreferences {
  const result: StoredPreferences = { ...DEFAULT_PREFERENCES };

  for (const row of saved) {
    if (!isKnownKey(row.prefKey)) continue;

    const value = row.prefValue;
    // Today every preference is a boolean. When there is one of another type,
    // this check opens up per key — not before.
    if (typeof value === 'boolean') {
      result[row.prefKey] = value;
    }
  }

  return result;
}

/** The preferences as the service hands them out: the domain, by meaning and not by table key. */
export interface Preferences {
  /** Whether this user keeps accounts at all. */
  accountsEnabled: boolean;
}

export function preferencesOf(stored: StoredPreferences): Preferences {
  return { accountsEnabled: stored[ACCOUNTS_ENABLED] };
}
