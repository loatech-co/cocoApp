import {
  type EvaluationContext,
  FlagNotFoundError,
  type JsonValue,
  type Provider,
  type ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/server-sdk';

import { isFlagName, type FlagName } from '@coco/flags';

/** Per-user values, `feature:<name>` in `user_preferences`. */
export type UserOverrides = (userId: bigint) => Promise<ReadonlyMap<FlagName, boolean>>;

/**
 * Our own OpenFeature provider: no external service (step 7.8, D25).
 *
 * Two sources, in this order:
 *   1. The USER's own value, `feature:<name>` in `user_preferences`. It wins
 *      both ways: `true` turns a flag on for one person before anyone else,
 *      `false` keeps one person out of a flag the server turned on for all.
 *   2. The SERVER's `FEATURES=a,b`, checked at boot: on for every user.
 * Neither says anything → the caller's default. A name that is not in the
 * registry is FLAG_NOT_FOUND, which OpenFeature turns into the default too.
 *
 * The user is the evaluation context's `targetingKey`, the user id. Without
 * one only the server source applies.
 *
 * Flags are booleans: the other three resolvers answer TYPE_MISMATCH.
 */
export class CocoFlagProvider implements Provider {
  readonly metadata = { name: 'coco' } as const;
  readonly runsOn = 'server' as const;

  constructor(
    private readonly serverFlags: ReadonlySet<FlagName>,
    private readonly userOverrides: UserOverrides,
  ) {}

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    if (!isFlagName(flagKey)) throw new FlagNotFoundError(`"${flagKey}" is not in packages/flags`);

    const userId = userIdOf(context);
    if (userId !== null) {
      const own = (await this.userOverrides(userId)).get(flagKey);
      if (own !== undefined) {
        return { value: own, reason: StandardResolutionReasons.TARGETING_MATCH, variant: 'user' };
      }
    }
    if (this.serverFlags.has(flagKey)) {
      return { value: true, reason: StandardResolutionReasons.STATIC, variant: 'server' };
    }
    return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
  }

  resolveStringEvaluation(): Promise<ResolutionDetails<string>> {
    return Promise.reject(new TypeMismatchError('Coco flags are booleans'));
  }

  resolveNumberEvaluation(): Promise<ResolutionDetails<number>> {
    return Promise.reject(new TypeMismatchError('Coco flags are booleans'));
  }

  resolveObjectEvaluation<T extends JsonValue>(): Promise<ResolutionDetails<T>> {
    return Promise.reject(new TypeMismatchError('Coco flags are booleans'));
  }
}

/** The user id in `targetingKey`, or `null` if there is none or it is not an id. */
function userIdOf(context: EvaluationContext): bigint | null {
  const key = context.targetingKey;
  return key !== undefined && /^\d+$/.test(key) ? BigInt(key) : null;
}
