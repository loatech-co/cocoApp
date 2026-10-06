import { useState } from 'react';

import { useHistory } from '@/features/transactions/api/transactions';
import { rangeOf, type Filters, type Preset } from '@/features/transactions/model/filters';
import { monthOfIso, type VisibleMonth } from '@/shared/ui/molecules/calendar';

/** Las dos fechas en orden, vengan como vengan: se puede pintar al revés. */
function sorted(a: string, b: string): { from: string; to: string } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

export interface Draft {
  preset: Preset;
  from: string;
  to: string;
}

/** El mes que conviene mostrar al abrir: donde termina el rango. */
function draftMonth(b: Draft): VisibleMonth {
  // En "Todo" el rango puede llegar lejos; abrir allá no ayuda a nadie.
  return monthOfIso(b.preset === 'todo' ? new Date().toISOString().slice(0, 10) : b.to);
}

/** El rango a medio elegir: el borrador, el primer clic y el mes a la vista. */
export function useRangeDraft(filters: Filters) {
  const initial: Draft = { preset: filters.preset, from: filters.from, to: filters.to };
  const [draft, setDraft] = useState<Draft>(initial);
  /** El primer clic, a la espera del segundo. `null` = no hay nada a medias. */
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [vista, setVista] = useState(() => draftMonth(initial));
  const history = useHistory();

  function choosePreset(preset: Preset): void {
    const next: Draft = { preset, ...rangeOf(preset, history.data) };
    setDraft(next);
    setVista(draftMonth(next));
    setAnchor(null);
    setHovered(null);
  }

  function chooseDay(iso: string): void {
    if (anchor === null) {
      setAnchor(iso);
      setHovered(iso);
      return;
    }
    setDraft({ preset: 'personalizado', ...sorted(anchor, iso) });
    setAnchor(null);
    setHovered(null);
  }

  // Mientras hay un clic a medias manda la selección en curso, no el borrador:
  // así se ve crecer el rango con el ratón antes de fijarlo.
  const painted = anchor !== null ? sorted(anchor, hovered ?? anchor) : draft;
  // En "Todo" el rango va de 1970 a dentro de cinco años: pintarlo dejaría el
  // calendario entero coloreado, que no informa de nada.
  const isPainted = draft.preset !== 'todo' || anchor !== null;

  return {
    draft,
    anchor,
    setHovered,
    vista,
    setVista,
    first: history.data?.first ?? undefined,
    choosePreset,
    chooseDay,
    painted,
    isPainted,
  };
}
