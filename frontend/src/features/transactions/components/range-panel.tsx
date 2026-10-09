import { useRangeDraft, type Draft } from '@/features/transactions/hooks/use-range-draft';
import { PRESETS, type Filters, type Preset } from '@/features/transactions/model/filters';
import { longDay, longRange } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';
import { ToggleOption } from '@/shared/ui/atoms/toggle-option';
import { Calendar } from '@/shared/ui/molecules/calendar';

/**
 * What is inside the panel: the shortcuts, the month and the footer.
 *
 * ── Why it is its own component ─────────────────────────────────────────────
 * Because it MOUNTS on opening and goes away on closing, and two things come from that. The
 * draft is born fresh on every opening —if it was cancelled last time, what
 * was left half done has no reason to reappear— without having to reset it by
 * hand. And the history query, which is needed to know where
 * "Todo" starts, is only requested when someone opens the panel: living in the outer
 * component it was requested on every screen that had a date field.
 *
 * ── Why it has to be confirmed with Aplicar ─────────────────────────────────
 * Picking a range by hand is TWO clicks, and between the first and the second the
 * range is half done. If each click reloaded, the screen would refresh with
 * a cut nobody asked for —the lone day of the first click— and the second one
 * would arrive late. The draft lives in here until it is confirmed.
 */
export function RangePanel({
  filters,
  apply,
  hasShortcuts,
  close,
}: {
  filters: Filters;
  apply: (changes: Partial<Filters>) => void;
  hasShortcuts: boolean;
  close: () => void;
}) {
  const rangeDraft = useRangeDraft(filters);
  const { draft, anchor, setHovered, vista, setVista, painted, isPainted } = rangeDraft;
  const { choosePreset, chooseDay } = rangeDraft;

  function confirm(): void {
    if (draft.preset === 'personalizado') {
      apply({ preset: 'personalizado', from: draft.from, to: draft.to });
    } else {
      apply({ preset: draft.preset });
    }
    close();
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row">
        {/* ── Shortcuts ─────────────────────────────────────────────────────
            On a wide screen they are a column; on a phone they become chips
            that flow, because a side column would leave the calendar at
            half the width and with no room for the days. */}
        {hasShortcuts && <RangePresets draft={draft} onSelect={choosePreset} />}

        <Calendar
          className="flex-1 p-3"
          from={isPainted ? painted.from : undefined}
          to={isPainted ? painted.to : undefined}
          view={vista}
          onViewChange={setVista}
          onSelectDay={chooseDay}
          onHover={(iso) => anchor && setHovered(iso ?? anchor)}
        />
      </div>

      <RangeFooter
        draft={draft}
        anchor={anchor}
        first={rangeDraft.first}
        onCancel={close}
        onApply={confirm}
      />
    </div>
  );
}

function RangeFooter({
  draft,
  anchor,
  first,
  onCancel,
  onApply,
}: {
  draft: Draft;
  anchor: string | null;
  /** The first day with transactions, to say since when «todo» is. */
  first: string | undefined;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
      <span className="text-xs text-muted-foreground">
        {anchor !== null
          ? t('transactions.range.chooseEnd')
          : draft.preset === 'todo'
            ? first
              ? t('transactions.range.fromDay', { day: longDay(first) })
              : t('transactions.range.allTime')
            : longRange(draft.from, draft.to)}
      </span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="button" size="sm" onClick={onApply} disabled={anchor !== null}>
          {t('transactions.range.apply')}
        </Button>
      </div>
    </div>
  );
}

function RangePresets({ draft, onSelect }: { draft: Draft; onSelect: (preset: Preset) => void }) {
  return (
    <ul
      className={cn(
        'flex flex-wrap gap-1 border-b border-border p-2',
        'sm:w-44 sm:shrink-0 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r',
      )}
    >
      {PRESETS.filter((p) => p.value !== 'personalizado').map((p) => (
        <li key={p.value} className="sm:w-full">
          <ToggleOption
            isOn={draft.preset === p.value}
            onClick={() => onSelect(p.value)}
            title={p.help}
          >
            {p.label}
          </ToggleOption>
        </li>
      ))}
    </ul>
  );
}
