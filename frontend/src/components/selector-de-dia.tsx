import { CalendarDays } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Calendario } from '@/components/calendario';
import { Button } from '@/components/ui/button';
import { diaLargo } from '@/lib/fechas';
import { SUPERFICIE_FLOTANTE, SURGE } from '@/components/ui/superficie';
import { cn } from '@/lib/utils';
import { useDentroDeUnCampo } from '@/components/ui/campo';

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
  const enCampo = useDentroDeUnCampo();

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
        // `campo` y `md`: este botón ES un campo, y tiene que medir, teñirse
        // y redondearse como el `Input` y el `Combo` que tiene al lado.
        variant="campo"
        size="md"
        onClick={() => setAbierto((v) => !v)}
        disabled={deshabilitado}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        // `px-3` como el `Input` y el `Select` de la misma fila. El tamaño de
        // un botón reparte 20 a los lados —un verbo necesita aire—, y aquí lo
        // que hay no es un verbo sino un valor, que tiene que arrancar a la
        // misma altura que la etiqueta que lo nombra y que el texto de los
        // campos vecinos.
        className="w-full justify-between px-3"
      >
        <span
          data-lleno={valor ? 'si' : 'no'}
          data-vacio={valor ? undefined : ''}
          className={cn('min-w-0 flex-1 truncate text-left font-normal', enCampo && 'pt-4')}
        >
          {valor ? diaLargo(valor) : 'Elige una fecha'}
        </span>

        {/*
          ── El calendario va al FINAL, y no hay flecha ─────────────────────
          Antes llevaba las dos cosas: el calendario delante del valor y una
          flecha detrás. Sobraba una.

          El calendario no es informativo —no hace falta un dibujo para saber
          que un campo que dice "4 de abril de 2022" es una fecha—: es la
          señal de que ESTO ABRE UN CALENDARIO, que es justo el papel que
          cumple una flecha en un desplegable. Dos iconos para decir lo mismo,
          uno a cada lado.

          Así que se queda el que dice más, y se queda donde va lo que abre
          algo: a la derecha, en el mismo sitio donde el `Select` y el `Combo`
          ponen su flecha. Y de paso el valor arranca a la misma altura que en
          los demás campos en vez de ocho píxeles más adentro.

          No gira. Una flecha invertida dice "esto está abierto"; un
          calendario boca abajo no dice nada.
        */}
        <CalendarDays className="size-4 shrink-0 opacity-70" aria-hidden="true" />
      </Button>

      {abierto && !deshabilitado && (
        <div
          role="dialog"
          aria-label="Elegir fecha"
          className={cn(
            'absolute left-0 z-40 mt-2 w-[min(20rem,calc(100vw-3rem))] origin-top-left rounded-lg p-3',
            SUPERFICIE_FLOTANTE,
            SURGE,
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
