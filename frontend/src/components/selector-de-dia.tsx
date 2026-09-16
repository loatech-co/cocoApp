import { CalendarDays, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Calendario } from '@/components/calendario';
import { Button } from '@/components/ui/button';
import { diaLargo } from '@/lib/fechas';
import { cn } from '@/lib/utils';

/**
 * Un día, elegido en el calendario de la app.
 *
 * ── Por qué no `<input type="date">` ────────────────────────────────────────
 * Porque el que abre es el del SISTEMA OPERATIVO: su tipografía, sus colores,
 * su idioma y su semana empezando en domingo. En medio de un formulario verde
 * aparece un cuadro gris de Windows o de macOS, y el mismo formulario se ve
 * distinto en cada máquina.
 *
 * Es la misma rejilla del filtro de fechas, con un solo extremo en vez de dos.
 */
export function SelectorDeDia({
  id,
  valor,
  onElegir,
  requerido = false,
  deshabilitado = false,
}: {
  id?: string;
  /** `YYYY-MM-DD`. */
  valor: string;
  onElegir: (iso: string) => void;
  requerido?: boolean;
  /** Se pinta igual pero no abre nada: es un dato que se lee, no se elige. */
  deshabilitado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={caja} className="relative">
      {/*
        El valor viaja además en un campo oculto para que el formulario lo
        envíe y `required` siga funcionando: un botón no es un campo, y sin
        esto el navegador no tendría nada que validar.
      */}
      <input type="hidden" name={id} value={valor} required={requerido} />

      <Button
        id={id}
        type="button"
        variant="herramienta"
        // `campo` y no `default`: este botón es un CAMPO, y tiene que medir y
        // redondearse como el `Input` y el `Combo` que tiene al lado.
        size="md"
        onClick={() => setAbierto((v) => !v)}
        disabled={deshabilitado}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        className="w-full justify-between"
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDays className="size-4 shrink-0 opacity-70" aria-hidden="true" />
          <span className="truncate font-normal">{valor ? diaLargo(valor) : 'Elige una fecha'}</span>
        </span>
        <ChevronDown
          className={cn('size-3.5 shrink-0 opacity-60 transition-transform', abierto && 'rotate-180')}
          aria-hidden="true"
        />
      </Button>

      {abierto && !deshabilitado && (
        <div
          role="dialog"
          aria-label="Elegir fecha"
          className={cn(
            'absolute left-0 z-40 mt-2 w-[min(20rem,calc(100vw-3rem))] rounded-lg bg-popover p-3',
            'shadow-[var(--sombra-flotante)] ring-1 ring-black/5 dark:ring-white/12',
          )}
        >
          <Calendario
            desde={valor || undefined}
            hasta={valor || undefined}
            onDia={(iso) => {
              onElegir(iso);
              // Un solo día no necesita confirmarse: con el segundo clic ya no
              // queda nada por decidir.
              setAbierto(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
