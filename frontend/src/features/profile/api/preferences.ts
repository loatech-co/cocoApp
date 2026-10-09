import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { Preferences, UpdatePreferencesInput } from '@/shared/api/generated/model';
import {
  preferencesGet,
  preferencesUpdate,
} from '@/shared/api/generated/preferences-v2/preferences-v2';

/**
 * User preferences.
 *
 * Today there is only one, and it decides the shape of half the app: whether
 * this person keeps accounts. Off —the usual— the navigation does not show
 * Accounts, quick capture does not ask for one, and balances simply do not
 * appear.
 */
export type UserPreferences = Preferences;

/**
 * What is assumed while the server answers.
 *
 * It has to match the API's default preferences. And the value matters: if
 * `true` were assumed here, an Accounts menu would show during the first
 * flicker and then disappear.
 */
const DEFAULTS: UserPreferences = { accountsEnabled: false };

const preferencesKey = ['preferences'] as const;

export function usePreferences(): UseQueryResult<UserPreferences> {
  return useQuery({
    queryKey: preferencesKey,
    queryFn: async () => (await preferencesGet()).data,
    // They change very rarely and half the app reads them: there is no point
    // asking for them again on every mount.
    staleTime: 5 * 60_000,
  });
}

/**
 * Shortcut for the question asked in several places.
 *
 * It returns the default while loading, instead of `undefined`: that way no
 * component has to handle a third state just for this.
 */
export function useHasAccounts(): boolean {
  return usePreferences().data?.accountsEnabled ?? DEFAULTS.accountsEnabled;
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (changes: UpdatePreferencesInput) => (await preferencesUpdate(changes)).data,
    onSuccess: (preferences) => {
      // The answer is written straight into the cache instead of invalidating:
      // turning the switch off has to reorder the navigation at once, without
      // a network round trip in between.
      queryClient.setQueryData(preferencesKey, preferences);
    },
  });
}
