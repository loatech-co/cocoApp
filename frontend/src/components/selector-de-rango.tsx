import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { PRESETS, type Filtros, type Preset } from '@/lib/filtros';
import { cn } from '@/lib/utils';

const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/** `2026-03-14` → `14 mar 2026`. Las fechas en ISO no se leen de un vistazo. */
function bonita(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1] ?? m} ${a}`;
}

/**
 * El selector de rango de tiempo.
 *
 * ── Por qué un desplegable y no pestañas ────────────────────────────────────
 * Seis pestañas siempre visibles ocupan una fila entera, se desbordan en un
 * teléfono y obligan a leer todas las opciones aunque solo importe la activa.
 * Un control único muestra QUÉ RANGO se está viendo —que es la información
 * útil— y esconde el resto hasta que alguien quiera cambiarlo.
 *
 * Dentro conviven los atajos y las dos fechas: no son dos controles distintos,
 * son dos formas de decir lo mismo, y separarlos obliga a buscar en qué sitio
 * está la que uno necesita.
 */
export function SelectorDeRango({
  filtros,
  aplicar,
}: {
  filtros: Filtros;
  aplicar: (cambios: Partial<Filtros>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Cerrar al tocar fuera y con Escape: un panel que solo se cierra con su
  // propio botón se queda abierto tapando el contenido.
  useEffect(() => {
    if (!abierto) return;

    const fuera = (e: MouseEvent): void => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  const activo = PRESETS.find((p) => p.valor === filtros.preset);
  const etiqueta =
    filtros.preset === 'todo'
      ? 'Todo el histórico'
      : filtros.preset === 'personalizado'
        ? `${bonita(filtros.from)} — ${bonita(filtros.to)}`
        : (activo?.etiqueta ?? 'Rango');

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium',
          'transition-colors hover:bg-secondary sm:w-auto',
        )}
        style={{ borderColor: 'var(--input)' }}
      >
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-left">{etiqueta}</span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Elegir rango de tiempo"
          className={cn(
            'absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-popover p-2',
            'shadow-[0_4px_12px_rgba(12,31,24,0.08),0_16px_40px_-12px_rgba(12,31,24,0.25)]',
          )}
        >
          <ul className="flex flex-col">
            {PRESETS.filter((p) => p.valor !== 'personalizado').map((p) => (
              <li key={p.valor}>
                <button
                  type="button"
                  onClick={() => {
                    aplicar({ preset: p.valor });
                    setAbierto(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                    filtros.preset === p.valor
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-secondary',
                  )}
                >
                  <Check
                    className={cn('size-4 shrink-0', filtros.preset !== p.valor && 'invisible')}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{p.etiqueta}</span>
                    <span className="block text-xs opacity-70">{p.ayuda}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-2 border-t border-border px-3 pb-1 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              O elige las fechas
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                aria-label="Desde"
                value={filtros.preset === 'todo' ? '' : filtros.from}
                max={filtros.to}
                onChange={(e) => aplicar({ from: e.target.value })}
                className="h-9 text-sm"
              />
              <span className="shrink-0 text-xs text-muted-foreground">a</span>
              <Input
                type="date"
                aria-label="Hasta"
                value={filtros.preset === 'todo' ? '' : filtros.to}
                min={filtros.from}
                onChange={(e) => aplicar({ to: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type { Preset };
