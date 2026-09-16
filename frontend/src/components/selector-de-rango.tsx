import { CalendarDays, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Calendario, mesDeISO, type MesVisible } from '@/components/calendario';
import { diaLargo, rangoLargo } from '@/lib/fechas';
import { PRESETS, rangoDe, type Filtros, type Preset } from '@/lib/filtros';
import { useHistoria } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Las dos fechas en orden, vengan como vengan: se puede pintar al revés. */
function ordenadas(a: string, b: string): { from: string; to: string } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

interface Borrador {
  preset: Preset;
  from: string;
  to: string;
}

/** El mes que conviene mostrar al abrir: donde termina el rango. */
function mesDelBorrador(b: Borrador): MesVisible {
  // En "Todo" el rango puede llegar lejos; abrir allá no ayuda a nadie.
  return mesDeISO(b.preset === 'todo' ? new Date().toISOString().slice(0, 10) : b.to);
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
 * ── Por qué los atajos y el calendario van juntos ───────────────────────────
 * No son dos controles distintos, son dos formas de decir lo mismo: "el mes en
 * curso" y "del 1 al 15 de septiembre" producen el mismo recorte. Separarlos
 * obligaría a buscar en qué sitio está el que uno necesita.
 *
 * ── Por qué hay que confirmar con Aplicar ───────────────────────────────────
 * Elegir un rango a mano son DOS clics, y entre el primero y el segundo el
 * rango está a medias. Si cada clic recargara, la pantalla se refrescaría con
 * un recorte que nadie pidió —el día suelto del primer clic— y el segundo
 * llegaría tarde. El borrador vive aquí dentro hasta que se confirma.
 */
export function SelectorDeRango({
  filtros,
  aplicar,
}: {
  filtros: Filtros;
  aplicar: (cambios: Partial<Filtros>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<Borrador>({
    preset: filtros.preset,
    from: filtros.from,
    to: filtros.to,
  });
  /** El primer clic, a la espera del segundo. `null` = no hay nada a medias. */
  const [ancla, setAncla] = useState<string | null>(null);
  const [sobrevolado, setSobrevolado] = useState<string | null>(null);
  const [vista, setVista] = useState(() =>
    mesDelBorrador({ preset: filtros.preset, from: filtros.from, to: filtros.to }),
  );
  const historia = useHistoria();
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

  function abrir(): void {
    // El borrador se rehace en cada apertura: si se canceló la vez anterior,
    // lo que quedó a medias no tiene por qué reaparecer.
    const fresco: Borrador = { preset: filtros.preset, from: filtros.from, to: filtros.to };
    setBorrador(fresco);
    setVista(mesDelBorrador(fresco));
    setAncla(null);
    setSobrevolado(null);
    setAbierto(true);
  }

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

  function confirmar(): void {
    if (borrador.preset === 'personalizado') {
      aplicar({ preset: 'personalizado', from: borrador.from, to: borrador.to });
    } else {
      aplicar({ preset: borrador.preset });
    }
    setAbierto(false);
  }

  const activo = PRESETS.find((p) => p.valor === filtros.preset);
  const etiqueta =
    filtros.preset === 'todo'
      ? 'Todo el histórico'
      : filtros.preset === 'personalizado'
        ? rangoLargo(filtros.from, filtros.to)
        : (activo?.etiqueta ?? 'Rango');

  // Mientras hay un clic a medias manda la selección en curso, no el borrador:
  // así se ve crecer el rango con el ratón antes de fijarlo.
  const pintado = ancla !== null ? ordenadas(ancla, sobrevolado ?? ancla) : borrador;
  // En "Todo" el rango va de 1970 a dentro de cinco años: pintarlo dejaría el
  // calendario entero coloreado, que no informa de nada.
  const pinta = borrador.preset !== 'todo' || ancla !== null;

  return (
    <div ref={caja} className="relative">
      <Button
        type="button"
        variant="herramienta"
        size="sm"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        aria-expanded={abierto}
        aria-pressed={abierto}
        aria-haspopup="dialog"
        // El único ancho a medida de toda la barra, y por una razón: la
        // etiqueta es el rango entero y tiene que poder encogerse.
        className="max-w-full"
      >
        <CalendarDays className="size-4 shrink-0 opacity-70" aria-hidden="true" />
        <span className="min-w-0 truncate">{etiqueta}</span>
        <ChevronDown
          className={cn('size-3.5 shrink-0 opacity-60 transition-transform', abierto && 'rotate-180')}
          aria-hidden="true"
        />
      </Button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Elegir rango de tiempo"
          className={cn(
            // Anclado a la DERECHA: el control vive al final de una barra
            // alineada a la derecha, y abriendo hacia la derecha un panel de
            // 34rem se sale de la pantalla.
            'absolute right-0 z-30 mt-2 w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-lg bg-popover',
            'shadow-[var(--sombra-flotante)] ring-1 ring-black/5 dark:ring-white/12',
          )}
        >
          <div className="flex flex-col sm:flex-row">
            {/* ── Atajos ──────────────────────────────────────────────────
                En pantalla ancha son una columna; en un teléfono se vuelven
                fichas que fluyen, porque una columna lateral dejaría el
                calendario en la mitad del ancho y sin sitio para los días. */}
            <ul
              className={cn(
                'flex flex-wrap gap-1 border-b border-border p-2',
                'sm:w-44 sm:shrink-0 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r',
              )}
            >
              {PRESETS.filter((p) => p.valor !== 'personalizado').map((p) => (
                <li key={p.valor} className="sm:w-full">
                  <button
                    type="button"
                    onClick={() => elegirPreset(p.valor)}
                    aria-pressed={borrador.preset === p.valor}
                    title={p.ayuda}
                    className={cn(
                      // Concéntrico con el panel: 20px del contenedor menos los
                      // 8px de su relleno. Con un radio mayor, la esquina del
                      // resaltado se sale de la curva del panel y se ve torcida.
                      'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      borrador.preset === p.valor
                        ? 'bg-secondary font-semibold text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    {p.etiqueta}
                  </button>
                </li>
              ))}
            </ul>

            {/* ── Calendario ─────────────────────────────────────────────── */}
            <Calendario
              className="flex-1 p-3"
              desde={pinta ? pintado.from : undefined}
              hasta={pinta ? pintado.to : undefined}
              vista={vista}
              onVista={setVista}
              onDia={elegirDia}
              onSobrevolar={(iso) => ancla && setSobrevolado(iso ?? ancla)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {ancla !== null
                ? 'Elige la fecha final'
                : borrador.preset === 'todo'
                  ? historia.data?.first
                    ? `Desde ${diaLargo(historia.data.first)}`
                    : 'Todo el histórico'
                  : rangoLargo(borrador.from, borrador.to)}
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={confirmar} disabled={ancla !== null}>
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type { Preset };
