import { useRangeDraft, type Draft } from '@/features/transactions/hooks/use-range-draft';
import { PRESETS, type Filters, type Preset } from '@/features/transactions/model/filters';
import { longDay, longRange } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';
import { ToggleOption } from '@/shared/ui/atoms/toggle-option';
import { Calendar } from '@/shared/ui/molecules/calendar';

/**
 * Lo que hay dentro del panel: los atajos, el mes y el pie.
 *
 * ── Por qué es su propio componente ─────────────────────────────────────────
 * Porque se MONTA al abrir y se va al cerrar, y de ahí salen dos cosas. El
 * borrador nace fresco en cada apertura —si se canceló la vez anterior, lo que
 * quedó a medias no tiene por qué reaparecer— sin necesidad de rehacerlo a
 * mano. Y la consulta de la historia, que hace falta para saber dónde empieza
 * "Todo", solo se pide cuando alguien abre el panel: viviendo en el componente
 * de fuera se pedía en cada pantalla que tuviera un campo de fecha.
 *
 * ── Por qué hay que confirmar con Aplicar ───────────────────────────────────
 * Elegir un rango a mano son DOS clics, y entre el primero y el segundo el
 * rango está a medias. Si cada clic recargara, la pantalla se refrescaría con
 * un recorte que nadie pidió —el día suelto del primer clic— y el segundo
 * llegaría tarde. El borrador vive aquí dentro hasta que se confirma.
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
        {/* ── Atajos ────────────────────────────────────────────────────────
            En pantalla ancha son una columna; en un teléfono se vuelven fichas
            que fluyen, porque una columna lateral dejaría el calendario en la
            mitad del ancho y sin sitio para los días. */}
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
  /** El primer día con movimientos, para decir desde cuándo es «todo». */
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
