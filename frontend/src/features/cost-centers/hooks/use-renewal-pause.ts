import { useState } from 'react';

import {
  usePauseRenewal,
  useRecurrencePauses,
  useRemovePause,
  useResumeRenewal,
} from '@/features/cost-centers/api/recurrence-pauses';
import { openPause } from '@/features/cost-centers/model/renewal-pause';
import { ApiClientError } from '@/shared/api/api-client';
import type { PausedCharge } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';

const errorOf = (e: unknown): string =>
  e instanceof ApiClientError ? e.message : t('centers.pause.failed');

/**
 * The state behind «Pausar renovación» and «Reactivar renovación» (ADR 0036):
 * the history, whether the month is being asked, the answer, and the charges
 * found in months that became paused, which wait for the person's decision.
 */
export function useRenewalPause(conceptId: number) {
  const pauses = useRecurrencePauses(conceptId).data ?? [];
  const pauseMutation = usePauseRenewal(conceptId);
  const resumeMutation = useResumeRenewal(conceptId);
  const removeMutation = useRemovePause(conceptId);
  const [isAsking, setIsAsking] = useState(false);
  const [found, setFound] = useState<{ pauseId: number; charges: PausedCharge[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = openPause(pauses);

  async function answer(month: string) {
    setError(null);
    try {
      if (open) {
        await resumeMutation.mutateAsync({ pauseId: open.id, resumeMonth: month });
      } else {
        const { pause, charges } = await pauseMutation.mutateAsync(month);
        if (charges.length > 0) setFound({ pauseId: pause.id, charges });
      }
      setIsAsking(false);
    } catch (e) {
      setError(errorOf(e));
    }
  }

  function remove(pauseId: number) {
    setError(null);
    removeMutation.mutate(pauseId, { onError: (e) => setError(errorOf(e)) });
  }

  return {
    pauses,
    open,
    isAsking,
    isSaving: pauseMutation.isPending || resumeMutation.isPending,
    found,
    error,
    ask: () => setIsAsking(true),
    cancel: () => setIsAsking(false),
    answer: (month: string) => void answer(month),
    remove,
    settle: () => setFound(null),
  };
}
