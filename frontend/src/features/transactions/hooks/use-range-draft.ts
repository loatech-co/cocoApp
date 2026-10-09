import { useState } from 'react';

import { useHistory } from '@/features/transactions/api/transactions';
import { rangeOf, type Filters, type Preset } from '@/features/transactions/model/filters';
import { monthOfIso, type VisibleMonth } from '@/shared/ui/molecules/calendar';

/** The two dates in order, however they come: it can be painted backwards. */
function sorted(a: string, b: string): { from: string; to: string } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

export interface Draft {
  preset: Preset;
  from: string;
  to: string;
}

/** The month worth showing on opening: where the range ends. */
function draftMonth(b: Draft): VisibleMonth {
  // In "Todo" the range can reach far; opening over there helps nobody.
  return monthOfIso(b.preset === 'todo' ? new Date().toISOString().slice(0, 10) : b.to);
}

/** The half-picked range: the draft, the first click and the month in view. */
export function useRangeDraft(filters: Filters) {
  const initial: Draft = { preset: filters.preset, from: filters.from, to: filters.to };
  const [draft, setDraft] = useState<Draft>(initial);
  /** The first click, waiting for the second. `null` = nothing is half done. */
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

  // While there is a half-done click the ongoing selection rules, not the draft:
  // that way you see the range grow with the mouse before fixing it.
  const painted = anchor !== null ? sorted(anchor, hovered ?? anchor) : draft;
  // In "Todo" the range goes from 1970 to five years from now: painting it would leave the
  // whole calendar colored, which tells nothing.
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
