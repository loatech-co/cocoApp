import { useState } from 'react';

import { useHistoria } from '@/features/transactions/api/transactions';
import { rangoDe, type Filtros, type Preset } from '@/features/transactions/model/filtros';
import { mesDeISO, type MesVisible } from '@/shared/ui/molecules/calendario';

/** Las dos fechas en orden, vengan como vengan: se puede pintar al revés. */
function ordenadas(a: string, b: string): { from: string; to: string } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

export interface Borrador {
  preset: Preset;
  from: string;
  to: string;
}

/** El mes que conviene mostrar al abrir: donde termina el rango. */
function mesDelBorrador(b: Borrador): MesVisible {
  // En "Todo" el rango puede llegar lejos; abrir allá no ayuda a nadie.
  return mesDeISO(b.preset === 'todo' ? new Date().toISOString().slice(0, 10) : b.to);
}

/** El rango a medio elegir: el borrador, el primer clic y el mes a la vista. */
export function useRangeDraft(filtros: Filtros) {
  const inicial: Borrador = { preset: filtros.preset, from: filtros.from, to: filtros.to };
  const [borrador, setBorrador] = useState<Borrador>(inicial);
  /** El primer clic, a la espera del segundo. `null` = no hay nada a medias. */
  const [ancla, setAncla] = useState<string | null>(null);
  const [sobrevolado, setSobrevolado] = useState<string | null>(null);
  const [vista, setVista] = useState(() => mesDelBorrador(inicial));
  const historia = useHistoria();

  function elegirPreset(preset: Preset): void {
    const siguiente: Borrador = { preset, ...rangoDe(preset, historia.data) };
    setBorrador(siguiente);
    setVista(mesDelBorrador(siguiente));
    setAncla(null);
    setSobrevolado(null);
  }

  function elegirDia(iso: string): void {
    if (ancla === null) {
      setAncla(iso);
      setSobrevolado(iso);
      return;
    }
    setBorrador({ preset: 'personalizado', ...ordenadas(ancla, iso) });
    setAncla(null);
    setSobrevolado(null);
  }

  // Mientras hay un clic a medias manda la selección en curso, no el borrador:
  // así se ve crecer el rango con el ratón antes de fijarlo.
  const pintado = ancla !== null ? ordenadas(ancla, sobrevolado ?? ancla) : borrador;
  // En "Todo" el rango va de 1970 a dentro de cinco años: pintarlo dejaría el
  // calendario entero coloreado, que no informa de nada.
  const pinta = borrador.preset !== 'todo' || ancla !== null;

  return {
    borrador,
    ancla,
    setSobrevolado,
    vista,
    setVista,
    primero: historia.data?.first ?? undefined,
    elegirPreset,
    elegirDia,
    pintado,
    pinta,
  };
}
