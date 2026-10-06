import { useRangeDraft, type Borrador } from '@/features/transactions/hooks/use-range-draft';
import { PRESETS, type Filtros, type Preset } from '@/features/transactions/model/filtros';
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
export function PanelDeRango({
  filtros,
  aplicar,
  atajos,
  cerrar,
}: {
  filtros: Filtros;
  aplicar: (cambios: Partial<Filtros>) => void;
  atajos: boolean;
  cerrar: () => void;
}) {
  const draft = useRangeDraft(filtros);
  const { borrador, ancla, setSobrevolado, vista, setVista, pintado, pinta } = draft;
  const { elegirPreset, elegirDia } = draft;

  function confirmar(): void {
    if (borrador.preset === 'personalizado') {
      aplicar({ preset: 'personalizado', from: borrador.from, to: borrador.to });
    } else {
      aplicar({ preset: borrador.preset });
    }
    cerrar();
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row">
        {/* ── Atajos ────────────────────────────────────────────────────────
            En pantalla ancha son una columna; en un teléfono se vuelven fichas
            que fluyen, porque una columna lateral dejaría el calendario en la
            mitad del ancho y sin sitio para los días. */}
        {atajos && <RangePresets borrador={borrador} onElegir={elegirPreset} />}

        <Calendar
          className="flex-1 p-3"
          from={pinta ? pintado.from : undefined}
          to={pinta ? pintado.to : undefined}
          view={vista}
          onViewChange={setVista}
          onSelectDay={elegirDia}
          onHover={(iso) => ancla && setSobrevolado(iso ?? ancla)}
        />
      </div>

      <RangeFooter
        borrador={borrador}
        ancla={ancla}
        primero={draft.primero}
        onCancelar={cerrar}
        onAplicar={confirmar}
      />
    </div>
  );
}

function RangeFooter({
  borrador,
  ancla,
  primero,
  onCancelar,
  onAplicar,
}: {
  borrador: Borrador;
  ancla: string | null;
  /** El primer día con movimientos, para decir desde cuándo es «todo». */
  primero: string | undefined;
  onCancelar: () => void;
  onAplicar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
      <span className="text-xs text-muted-foreground">
        {ancla !== null
          ? t('transactions.range.chooseEnd')
          : borrador.preset === 'todo'
            ? primero
              ? t('transactions.range.fromDay', { day: longDay(primero) })
              : t('transactions.range.allTime')
            : longRange(borrador.from, borrador.to)}
      </span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancelar}>
          {t('common.cancel')}
        </Button>
        <Button type="button" size="sm" onClick={onAplicar} disabled={ancla !== null}>
          {t('transactions.range.apply')}
        </Button>
      </div>
    </div>
  );
}

function RangePresets({
  borrador,
  onElegir,
}: {
  borrador: Borrador;
  onElegir: (preset: Preset) => void;
}) {
  return (
    <ul
      className={cn(
        'flex flex-wrap gap-1 border-b border-border p-2',
        'sm:w-44 sm:shrink-0 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r',
      )}
    >
      {PRESETS.filter((p) => p.valor !== 'personalizado').map((p) => (
        <li key={p.valor} className="sm:w-full">
          <ToggleOption
            isOn={borrador.preset === p.valor}
            onClick={() => onElegir(p.valor)}
            title={p.ayuda}
          >
            {p.etiqueta}
          </ToggleOption>
        </li>
      ))}
    </ul>
  );
}
