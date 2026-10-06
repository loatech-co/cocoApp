import {
  OpenFeature,
  OpenFeatureEventEmitter,
  type Provider,
  ProviderEvents,
  type ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/react-sdk';

/**
 * The OpenFeature half of the web's flags (step 7.8, D25).
 *
 * It lives in its own chunk: `flags.tsx` imports it dynamically after the
 * first paint, so OpenFeature (~25 kB) stays out of the initial bundle and its
 * 200 kB budget (step 7.9). Nothing else may import this file statically, or
 * the SDK goes back into the entry chunk.
 */

const FLAGS_DOMAIN = 'coco';

/** Answers from the list `/auth/me` returned. Synchronous, as the web SDK wants. */
class ActiveFlagsProvider implements Provider {
  readonly metadata = { name: 'coco-web' } as const;
  readonly runsOn = 'client' as const;
  readonly events = new OpenFeatureEventEmitter();
  private active: ReadonlySet<string> = new Set();

  /** Replaces the list and tells OpenFeature's listeners it changed. */
  setActive(names: readonly string[]): void {
    this.active = new Set(names);
    this.events.emit(ProviderEvents.ConfigurationChanged);
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean): ResolutionDetails<boolean> {
    if (this.active.has(flagKey)) {
      return { value: true, reason: StandardResolutionReasons.TARGETING_MATCH };
    }
    return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
  }

  resolveStringEvaluation(_: string, defaultValue: string): ResolutionDetails<string> {
    return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
  }

  resolveNumberEvaluation(_: string, defaultValue: number): ResolutionDetails<number> {
    return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
  }

  resolveObjectEvaluation<T>(_: string, defaultValue: T): ResolutionDetails<T> {
    return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
  }
}

const provider = new ActiveFlagsProvider();
const client = OpenFeature.getClient(FLAGS_DOMAIN);

/** Resolves once the provider is registered and evaluations are real. */
export const ready: Promise<void> = OpenFeature.setProviderAndWait(FLAGS_DOMAIN, provider);

export function setActive(names: readonly string[]): void {
  provider.setActive(names);
}

/** Evaluates a boolean flag through OpenFeature. */
export function isEnabled(name: string, defaultValue: boolean): boolean {
  return client.getBooleanValue(name, defaultValue);
}
