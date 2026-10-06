import {
  OpenFeature,
  OpenFeatureEventEmitter,
  OpenFeatureProvider,
  type Provider,
  ProviderEvents,
  type ResolutionDetails,
  StandardResolutionReasons,
  useBooleanFlagValue,
} from '@openfeature/react-sdk';
import { useQuery } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/shared/api/auth-context';
import { authMe } from '@/shared/api/generated/auth-v2/auth-v2';
import type { FlagName } from '@coco/flags';

/**
 * Feature flags in the web (step 7.8, D25).
 *
 * The API decides which flags are on for this user —the server's `FEATURES`
 * and the user's own `feature:<name>`— and lists them in `/auth/me`. The web
 * does not decide anything: this provider only holds that list and answers
 * OpenFeature from it. Components read a flag with `useFlag`, which is
 * OpenFeature's `useBooleanFlagValue` with the name typed against the
 * registry, so swapping this provider for a vendor one touches no component.
 */

const FLAGS_DOMAIN = 'coco';

/** Answers from the list `/auth/me` returned. Synchronous, as the web SDK wants. */
class ActiveFlagsProvider implements Provider {
  readonly metadata = { name: 'coco-web' } as const;
  readonly runsOn = 'client' as const;
  readonly events = new OpenFeatureEventEmitter();
  private active: ReadonlySet<string> = new Set();

  /** Replaces the list and tells every `useFlag` to read again. */
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
void OpenFeature.setProviderAndWait(FLAGS_DOMAIN, provider);

/**
 * Asks `/auth/me` once per signed-in user and keeps the provider in step.
 * Signing out empties the list, so the next account never sees the last one's
 * flags. It renders nothing of its own: no flag is on until the API says so.
 */
export function FlagsProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const userId = usuario?.id;

  const { data } = useQuery({
    queryKey: ['auth', 'me', 'features', userId],
    // `?? []`: an older API answered without the field.
    queryFn: async () => ((await authMe()).data.features as FlagName[] | undefined) ?? [],
    enabled: userId !== undefined,
    staleTime: Infinity,
  });

  const features = userId === undefined ? undefined : data;
  useEffect(() => {
    provider.setActive(features ?? []);
  }, [features]);

  return <OpenFeatureProvider domain={FLAGS_DOMAIN}>{children}</OpenFeatureProvider>;
}

/** Whether a registered flag is on for the signed-in user. Off until known. */
export function useFlag(name: FlagName): boolean {
  return useBooleanFlagValue(name, false);
}
