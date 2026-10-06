import { useQuery } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { useAuth } from '@/shared/api/auth-context';
import { authMe } from '@/shared/api/generated/auth-v2/auth-v2';
import type { FlagName } from '@coco/flags';

import type * as FlagsEngine from './flags-engine';

/**
 * Feature flags in the web (step 7.8, D25).
 *
 * The API decides which flags are on for this user —the server's `FEATURES`
 * and the user's own `feature:<name>`— and lists them in `/auth/me`. The web
 * does not decide anything: it holds that list and answers through OpenFeature
 * (`flags-engine.ts`). Components read a flag with `useFlag`, typed against
 * the registry, so swapping the provider for a vendor one touches no component.
 *
 * OpenFeature is loaded lazily, after the first paint, to keep it out of the
 * initial bundle (step 7.9). Until it arrives every flag reads its default
 * (off) — the same it reads until `/auth/me` answers — so the wait never shows
 * something that then disappears.
 */

let engine: typeof FlagsEngine | undefined;
let loading: Promise<void> | undefined;
let active: readonly string[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function loadEngine(): Promise<void> {
  loading ??= import('./flags-engine')
    .then(async (loaded) => {
      await loaded.ready;
      loaded.setActive(active);
      engine = loaded;
      notify();
    })
    .catch(() => {
      // A chunk that failed to load leaves every flag off; the next mount retries.
      loading = undefined;
    });
  return loading;
}

function setActive(names: readonly string[]): void {
  active = names;
  engine?.setActive(names);
  notify();
}

/**
 * Asks `/auth/me` once per signed-in user and keeps the flags in step.
 * Signing out empties the list, so the next account never sees the last one's
 * flags. It renders nothing of its own.
 */
export function FlagsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;

  const { data } = useQuery({
    queryKey: ['auth', 'me', 'features', userId],
    // `?? []`: an older API answered without the field.
    queryFn: async () => ((await authMe()).data.features as FlagName[] | undefined) ?? [],
    enabled: userId !== undefined,
    staleTime: Infinity,
  });

  useEffect(() => {
    void loadEngine();
  }, []);

  const features = userId === undefined ? undefined : data;
  useEffect(() => {
    setActive(features ?? []);
  }, [features]);

  return children;
}

/** Whether a registered flag is on for the signed-in user. Off until known. */
export function useFlag(name: FlagName): boolean {
  return useSyncExternalStore(subscribe, () => engine?.isEnabled(name, false) ?? false);
}
