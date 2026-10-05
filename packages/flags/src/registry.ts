/**
 * The single feature flag registry (step 7.8).
 *
 * Every flag the API, the web or iOS can ask about is declared here, once,
 * with who owns it and when it is expected to go away. `FlagName` is the union
 * of these keys, so asking for a flag that is not here does not compile.
 *
 * The life rule: a flag exists to ship something dark or to a few users, and
 * it is DELETED when that rollout ends. `removeBy` is when that is expected;
 * `scripts/ci/flags-expiry.mjs` warns once it passes and fails CI 30 days
 * later, so a forgotten flag cannot become permanent configuration.
 *
 * Names are snake_case: they travel inside `FEATURES=a,b` and inside the
 * `feature:<name>` key of `user_preferences`.
 */

/** A calendar date, `YYYY-MM-DD`. */
type IsoDate = `${number}-${number}-${number}`;

export interface FlagDefinition {
  /** What turning it on changes. */
  readonly description: string;
  /** Who decides when it is removed. */
  readonly owner: string;
  /** When the rollout is expected to be over and the flag deleted. */
  readonly removeBy: IsoDate;
}

export const FLAGS = {
  flags_canary: {
    description:
      'Canary for the flag system itself. Nothing reads it: it proves that the server ' +
      '(FEATURES) and per-user (user_preferences) sources reach /auth/me end to end.',
    owner: 'loatech-co',
    removeBy: '2027-01-31',
  },
} as const satisfies Record<string, FlagDefinition>;

export type FlagName = keyof typeof FLAGS;

export const FLAG_NAMES = Object.keys(FLAGS) as FlagName[];

export function isFlagName(name: string): name is FlagName {
  return Object.prototype.hasOwnProperty.call(FLAGS, name);
}
