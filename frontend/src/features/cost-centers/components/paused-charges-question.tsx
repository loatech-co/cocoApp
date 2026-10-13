import { useState } from 'react';

import { useDiscardPausedCharges } from '@/features/cost-centers/api/recurrence-pauses';
import { ApiClientError } from '@/shared/api/api-client';
import type { PausedCharge } from '@/shared/api/generated/model';
import { longMonth } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { Confirmation } from '@/shared/ui/organisms/confirmation';

interface PausedChargesQuestionProps {
  conceptId: number;
  /** The automatic charges found in months that became paused; `null` asks nothing. */
  found: { pauseId: number; charges: PausedCharge[] } | null;
  onDone: () => void;
}

/**
 * «These automatic charges fall in months now paused: delete them?»
 *
 * Asked, never assumed (ADR 0036): a charge the app wrote may still be money
 * that really left —the subscription was cancelled late—, and only the person
 * knows. Cancelling keeps them; the pause stays either way.
 */
export function PausedChargesQuestion({ conceptId, found, onDone }: PausedChargesQuestionProps) {
  const discard = useDiscardPausedCharges(conceptId);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onDone();
  }

  function confirm() {
    if (!found) return;
    setError(null);
    discard.mutate(
      { pauseId: found.pauseId, ids: found.charges.map((charge) => charge.id) },
      {
        onSuccess: close,
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : t('centers.pause.charges.failed')),
      },
    );
  }

  return (
    <Confirmation
      isOpen={found !== null}
      title={t('centers.pause.charges.title')}
      confirmLabel={t('centers.pause.charges.confirm')}
      isDestructive
      isBusy={discard.isPending}
      onConfirm={confirm}
      onCancel={close}
    >
      <p>{t('centers.pause.charges.intro')}</p>
      <ul className="my-2 list-disc pl-5">
        {found?.charges.map((charge) => (
          <li key={charge.id}>
            {t('centers.pause.charges.item', {
              concept: charge.conceptName,
              month: longMonth(charge.month).toLowerCase(),
            })}
          </li>
        ))}
      </ul>
      <p>{t('centers.pause.charges.question')}</p>
      {error && (
        <p role="alert" className="mt-2 text-destructive">
          {error}
        </p>
      )}
    </Confirmation>
  );
}
