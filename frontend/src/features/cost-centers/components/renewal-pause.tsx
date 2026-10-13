import { Pause, Play, X } from 'lucide-react';

import { useRenewalPause } from '@/features/cost-centers/hooks/use-renewal-pause';
import {
  previousMonth,
  renewalState,
  suggestedMonth,
  type RenewalState,
} from '@/features/cost-centers/model/renewal-pause';
import type { RecurrencePause } from '@/shared/api/generated/model';
import { longMonth, todayInBogota } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import { Section } from '@/shared/ui/molecules/section';

import { MonthQuestion } from './month-question';
import { PausedChargesQuestion } from './paused-charges-question';

const month = (iso: string): string => longMonth(iso).toLowerCase();

/** What the person reads about the renewal right now. */
function stateText(state: RenewalState): string {
  switch (state.kind) {
    case 'paused':
      return t('centers.pause.pausedSince', { month: month(state.from) });
    case 'scheduled':
      return t('centers.pause.scheduledFrom', { month: month(state.from) });
    case 'resuming':
      return t('centers.pause.resumesIn', { month: month(state.resume) });
    case 'active':
      return t('centers.pause.active');
  }
}

function periodText(pause: RecurrencePause): string {
  return pause.resumeMonth === null
    ? t('centers.pause.periodOpen', { from: month(pause.fromMonth) })
    : t('centers.pause.periodClosed', {
        from: month(pause.fromMonth),
        until: month(previousMonth(pause.resumeMonth)),
      });
}

/**
 * Pause and resume the renewal of a recurring concept (ADR 0036).
 *
 * While paused the concept does nothing recurring —no automatic charge, not
 * pending, not in the month's budget—, and that is said here, in the
 * concept's own form, because it is a property of the concept. Pausing never
 * deletes on its own: if charges were already written in months that became
 * paused, the person is shown them and decides.
 */
export function RenewalPause({ conceptId }: { conceptId: number }) {
  const today = todayInBogota().slice(0, 7);
  const renewal = useRenewalPause(conceptId);
  const { open } = renewal;

  return (
    <Section title={t('centers.pause.title')}>
      <RenewalSummary
        state={renewalState(renewal.pauses, today)}
        isOpen={open !== undefined}
        isAsking={renewal.isAsking}
        onAsk={renewal.ask}
      />
      {renewal.isAsking && (
        <MonthQuestion
          question={open ? t('centers.pause.askResume') : t('centers.pause.askFrom')}
          initial={suggestedMonth(today, open?.fromMonth)}
          today={today}
          confirmLabel={open ? t('centers.pause.confirmResume') : t('centers.pause.confirmPause')}
          isBusy={renewal.isSaving}
          onConfirm={renewal.answer}
          onCancel={renewal.cancel}
        />
      )}
      {renewal.error && (
        <p role="alert" className="text-sm text-destructive">
          {renewal.error}
        </p>
      )}
      <PauseHistory pauses={renewal.pauses} onRemove={renewal.remove} />
      <PausedChargesQuestion conceptId={conceptId} found={renewal.found} onDone={renewal.settle} />
    </Section>
  );
}

function RenewalSummary({
  state,
  isOpen,
  isAsking,
  onAsk,
}: {
  state: RenewalState;
  isOpen: boolean;
  isAsking: boolean;
  onAsk: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm">{stateText(state)}</p>
      {!isAsking && (
        <Button type="button" variant="outline" size="sm" onClick={onAsk}>
          {isOpen ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          {isOpen ? t('centers.pause.resume') : t('centers.pause.pause')}
        </Button>
      )}
    </div>
  );
}

/** Every period, the most recent first. A mistaken one can be removed. */
function PauseHistory({
  pauses,
  onRemove,
}: {
  pauses: readonly RecurrencePause[];
  onRemove: (pauseId: number) => void;
}) {
  if (pauses.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{t('centers.pause.history')}</p>
      <ul className="flex flex-col">
        {pauses.map((pause) => (
          <li key={pause.id} className="flex items-center justify-between gap-2 text-sm">
            <span>{periodText(pause)}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm-icon"
              aria-label={t('centers.pause.remove', { period: periodText(pause) })}
              title={t('centers.pause.removeShort')}
              onClick={() => onRemove(pause.id)}
            >
              <X aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
