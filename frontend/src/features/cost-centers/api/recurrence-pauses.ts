import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PausedCharge, RecurrencePause } from '@/shared/api/generated/model';
import {
  recurrencePausesCharges,
  recurrencePausesDiscard,
  recurrencePausesList,
  recurrencePausesPause,
  recurrencePausesRemove,
  recurrencePausesResume,
} from '@/shared/api/generated/recurrence-pauses-v2/recurrence-pauses-v2';
import { allPages } from '@/shared/api/pages';

/** The pauses of one concept (ADR 0036). */
const pausesKey = (conceptId: number) => ['categories', 'pauses', conceptId] as const;

/**
 * A pause changes what is pending and the month's budget, and deleting its
 * charges changes the movements: after any of them those screens are stale.
 */
function useRefreshAfterPause(conceptId: number) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: pausesKey(conceptId) });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
  };
}

/** The concept's pause history, the most recent first. */
export function useRecurrencePauses(conceptId: number) {
  return useQuery({
    queryKey: pausesKey(conceptId),
    queryFn: () => allPages((params) => recurrencePausesList(conceptId, params)),
  });
}

/**
 * Pauses from a month on, and brings back the automatic charges already
 * written in the months that became paused. It does NOT delete them: that is
 * the person's call (`useDiscardPausedCharges`).
 */
export function usePauseRenewal(conceptId: number) {
  const refresh = useRefreshAfterPause(conceptId);
  return useMutation({
    mutationFn: async (
      fromMonth: string,
    ): Promise<{ pause: RecurrencePause; charges: PausedCharge[] }> => {
      const pause = (await recurrencePausesPause(conceptId, { fromMonth })).data;
      const charges = await allPages((params) =>
        recurrencePausesCharges(conceptId, pause.id, params),
      );
      return { pause, charges };
    },
    onSuccess: refresh,
  });
}

/** Sets the month the concept renews again. */
export function useResumeRenewal(conceptId: number) {
  const refresh = useRefreshAfterPause(conceptId);
  return useMutation({
    mutationFn: async ({ pauseId, resumeMonth }: { pauseId: number; resumeMonth: string }) =>
      (await recurrencePausesResume(conceptId, pauseId, { resumeMonth })).data,
    onSuccess: refresh,
  });
}

/** Removes a period, as if it had never been scheduled. */
export function useRemovePause(conceptId: number) {
  const refresh = useRefreshAfterPause(conceptId);
  return useMutation({
    mutationFn: (pauseId: number) => recurrencePausesRemove(conceptId, pauseId),
    onSuccess: refresh,
  });
}

/** Deletes the automatic charges the person confirmed. */
export function useDiscardPausedCharges(conceptId: number) {
  const refresh = useRefreshAfterPause(conceptId);
  return useMutation({
    mutationFn: async ({ pauseId, ids }: { pauseId: number; ids: number[] }) =>
      (await recurrencePausesDiscard(conceptId, pauseId, { transactionIds: ids })).data,
    onSuccess: refresh,
  });
}
