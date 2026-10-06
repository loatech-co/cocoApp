import {
  useEffect,
  useRef,
  type PointerEvent as PointerEventoDeReact,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';

import { t } from '@/shared/lib/i18n';
import { removeShortcut } from '@/shared/lib/shortcuts';
import { AddSurface } from '@/shared/ui/atoms/add-surface';
import { MovableTile, TileRemove, tileClass } from '@/shared/ui/atoms/tile';

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
      data-no-swipe={estado === 'arreglando' ? '' : undefined}
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
          onQuitar={() => removeShortcut(pagina.ruta)}
          onIr={onIr}
          onBajar={alBajar}
          onMover={alMover}
          onSoltar={() => setArrastre(null)}
        />
      ))}

      {(estado === 'arreglando' || baldosas.length === 0) && (
        <div className="col-span-3">
          <AddSurface shape="row" onClick={() => setEstado('eligiendo')}>
            {t('shell.shortcuts.add')}
          </AddSurface>
        </div>
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
  const caja = tileClass(arreglando, arrastrada);

  const contenido = (
    <>
      <Icono className="size-6 shrink-0" aria-hidden={true} />
      <span className="line-clamp-2 text-2xs font-medium leading-tight">{etiqueta}</span>
    </>
  );

  return (
    <div className="relative" data-baldosa>
      {arreglando ? (
        <MovableTile
          isDragging={arrastrada}
          label={etiqueta}
          style={estilo}
          onGrab={empezarAContar}
          onMove={props.onMover}
          onRelease={props.onSoltar}
        >
          {contenido}
        </MovableTile>
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

      {arreglando && <TileRemove label={etiqueta} onRemove={onQuitar} />}
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
