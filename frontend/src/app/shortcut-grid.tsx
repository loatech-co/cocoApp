import { Minus, Plus } from 'lucide-react';
import {
  useEffect,
  useRef,
  type PointerEvent as PointerEventoDeReact,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';

import { quitarAtajo } from '@/shared/lib/atajos';
import { cn } from '@/shared/lib/utils';
import { REALCE } from '@/shared/ui/foundations/superficie';

import type { Estado, PaginaDeAtajo } from './shortcut-types';
import type { useShortcutDrag } from './use-shortcut-drag';

/** Lo que hay que mantener pulsado para entrar a editar. */
const MANTENER = 500;

type Drag = ReturnType<typeof useShortcutDrag>;

/** La rejilla de baldosas y, mientras se arregla, el hueco de «Agregar atajo». */
export function ShortcutGrid({
  baldosas,
  estado,
  drag,
  setEstado,
  onIr,
}: {
  baldosas: readonly PaginaDeAtajo[];
  estado: Estado;
  drag: Drag;
  setEstado: (estado: Estado) => void;
  onIr: () => void;
}) {
  const { arrastre, setArrastre, rejilla, alBajar, alMover } = drag;

  return (
    <div
      ref={rejilla}
      // Mientras se arregla, la rejilla se queda con el puntero: sin esto, un
      // arrastre hacia abajo para mover una baldosa cerraría el panel.
      data-sin-deslizar={estado === 'arreglando' ? '' : undefined}
      className="grid grid-cols-3 gap-3"
    >
      {baldosas.map((pagina, indice) => (
        <Baldosa
          key={pagina.ruta}
          pagina={pagina}
          indice={indice}
          arreglando={estado === 'arreglando'}
          arrastrada={arrastre?.indice === indice}
          desplazamiento={arrastre?.indice === indice ? arrastre : null}
          onMantener={() => setEstado('arreglando')}
          onQuitar={() => quitarAtajo(pagina.ruta)}
          onIr={onIr}
          onBajar={alBajar}
          onMover={alMover}
          onSoltar={() => setArrastre(null)}
        />
      ))}

      {(estado === 'arreglando' || baldosas.length === 0) && (
        <button
          type="button"
          onClick={() => setEstado('eligiendo')}
          className="col-span-3 flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          <Plus className="size-4" aria-hidden="true" />
          Agregar atajo
        </button>
      )}
    </div>
  );
}

/** Mantener pulsada una baldosa entra a editar; soltarla antes, no. */
function useLongPress(onMantener: () => void) {
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mantuvo = useRef(false);

  function empezar(): void {
    mantuvo.current = false;
    reloj.current = setTimeout(() => {
      mantuvo.current = true;
      onMantener();
    }, MANTENER);
  }

  function dejarDeContar(): void {
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = null;
  }

  useEffect(() => dejarDeContar, []);

  return { empezar, dejarDeContar, mantuvo };
}

function claseDeBaldosa(arreglando: boolean, arrastrada: boolean): string {
  return cn(
    'relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-muted p-2 text-center text-foreground transition-colors',
    REALCE,
    // La baldosa que va en el dedo no tiembla: la animación pisaría el
    // desplazamiento en línea y se quedaría quieta bajo el dedo.
    arreglando && !arrastrada && 'animate-[baldosa-tiembla_.4s_ease-in-out_infinite]',
    arrastrada && 'z-10 scale-105 shadow-[var(--sombra-flotante)]',
  );
}

interface PropsDeBaldosa {
  pagina: PaginaDeAtajo;
  indice: number;
  arreglando: boolean;
  arrastrada: boolean;
  desplazamiento: { dx: number; dy: number } | null;
  onMantener: () => void;
  onQuitar: () => void;
  onIr: () => void;
  onBajar: (e: PointerEventoDeReact<HTMLElement>, indice: number) => void;
  onMover: (e: PointerEventoDeReact<HTMLElement>) => void;
  onSoltar: () => void;
}

function Baldosa(props: PropsDeBaldosa) {
  const { pagina, indice, arreglando, arrastrada, desplazamiento, onQuitar } = props;
  const { empezar, dejarDeContar, mantuvo } = useLongPress(props.onMantener);
  const { Icono, etiqueta, ruta } = pagina;

  function empezarAContar(e: PointerEventoDeReact<HTMLElement>): void {
    if (arreglando) {
      props.onBajar(e, indice);
      return;
    }
    empezar();
  }

  const estilo = desplazamiento
    ? { transform: `translate(${desplazamiento.dx}px, ${desplazamiento.dy}px)` }
    : undefined;
  const caja = claseDeBaldosa(arreglando, arrastrada);

  const contenido = (
    <>
      <Icono className="size-6 shrink-0" aria-hidden={true} />
      <span className="line-clamp-2 text-2xs font-medium leading-tight">{etiqueta}</span>
    </>
  );

  return (
    <div className="relative" data-baldosa>
      {arreglando ? (
        <button
          type="button"
          className={cn(caja, 'w-full touch-none')}
          style={estilo}
          onPointerDown={empezarAContar}
          onPointerMove={props.onMover}
          onPointerUp={props.onSoltar}
          onPointerCancel={props.onSoltar}
          aria-label={`Mover ${etiqueta}`}
        >
          {contenido}
        </button>
      ) : (
        <EnlaceDeBaldosa
          ruta={ruta}
          className={caja}
          largaPulsacion={{ empezarAContar, dejarDeContar, mantuvo }}
          onIr={props.onIr}
        >
          {contenido}
        </EnlaceDeBaldosa>
      )}

      {arreglando && <QuitarBaldosa etiqueta={etiqueta} onQuitar={onQuitar} />}
    </div>
  );
}

/** Fuera de la edición, la baldosa lleva a su página; mantenida, entra a editar. */
function EnlaceDeBaldosa({
  ruta,
  className,
  largaPulsacion,
  onIr,
  children,
}: {
  ruta: string;
  className: string;
  largaPulsacion: {
    empezarAContar: (e: PointerEventoDeReact<HTMLElement>) => void;
    dejarDeContar: () => void;
    mantuvo: { current: boolean };
  };
  onIr: () => void;
  children: ReactNode;
}) {
  const { empezarAContar, dejarDeContar, mantuvo } = largaPulsacion;
  return (
    <Link
      to={ruta}
      className={className}
      onPointerDown={empezarAContar}
      onPointerUp={dejarDeContar}
      onPointerCancel={dejarDeContar}
      onPointerMove={dejarDeContar}
      onClick={(e) => {
        // Se mantuvo pulsada: la intención era editar, no ir.
        if (mantuvo.current) {
          e.preventDefault();
          return;
        }
        onIr();
      }}
    >
      {children}
    </Link>
  );
}

/**
 * El menos.
 *
 * 24, por debajo del suelo táctil de 42, y es una excepción CONCEDIDA,
 * no descubierta: se llega a él dentro de un modo al que se entra
 * manteniendo pulsada una baldosa, y uno más grande se pulsaría sin
 * querer justo al arrastrar, que es lo otro que se hace aquí.
 */
function QuitarBaldosa({
  etiqueta,
  onQuitar,
}: {
  etiqueta: string;
  onQuitar: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onQuitar}
      aria-label={`Quitar ${etiqueta}`}
      className="absolute -left-1 -top-1 grid size-6 place-items-center rounded-full bg-foreground text-background shadow-[var(--sombra-pegada)]"
    >
      <Minus className="size-3.5" strokeWidth={3} aria-hidden="true" />
    </button>
  );
}
