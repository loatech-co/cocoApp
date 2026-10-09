import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { t } from '@/shared/lib/i18n';
import { removeShortcut } from '@/shared/lib/shortcuts';
import { AddSurface } from '@/shared/ui/atoms/add-surface';
import { MovableTile, TileRemove, tileClass } from '@/shared/ui/atoms/tile';

import type { Mode, ShortcutPage } from './shortcut-types';
import type { useShortcutDrag } from './use-shortcut-drag';

/** Lo que hay que mantener pulsado para entrar a editar. */
const HOLD_MS = 500;

type Drag = ReturnType<typeof useShortcutDrag>;

/** La rejilla de baldosas y, mientras se arregla, el hueco de «Agregar atajo». */
export function ShortcutGrid({
  tiles,
  mode,
  drag,
  setMode,
  onGo,
}: {
  tiles: readonly ShortcutPage[];
  mode: Mode;
  drag: Drag;
  setMode: (mode: Mode) => void;
  onGo: () => void;
}) {
  const { drag: activeDrag, setDrag, grid, handleDown, handleMove } = drag;

  return (
    <div
      ref={grid}
      // Mientras se arregla, la rejilla se queda con el puntero: sin esto, un
      // arrastre hacia abajo para mover una baldosa cerraría el panel.
      data-no-swipe={mode === 'arreglando' ? '' : undefined}
      className="grid grid-cols-3 gap-3"
    >
      {tiles.map((page, index) => (
        <Tile
          key={page.route}
          page={page}
          index={index}
          isArranging={mode === 'arreglando'}
          isDragged={activeDrag?.index === index}
          offset={activeDrag?.index === index ? activeDrag : null}
          onHold={() => setMode('arreglando')}
          onRemove={() => removeShortcut(page.route)}
          onGo={onGo}
          onDown={handleDown}
          onMove={handleMove}
          onRelease={() => setDrag(null)}
        />
      ))}

      {(mode === 'arreglando' || tiles.length === 0) && (
        <div className="col-span-3">
          <AddSurface shape="row" onClick={() => setMode('eligiendo')}>
            {t('shell.shortcuts.add')}
          </AddSurface>
        </div>
      )}
    </div>
  );
}

/** Mantener pulsada una baldosa entra a editar; soltarla antes, no. */
function useLongPress(onHold: () => void) {
  const clock = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasHeld = useRef(false);

  function start(): void {
    wasHeld.current = false;
    clock.current = setTimeout(() => {
      wasHeld.current = true;
      onHold();
    }, HOLD_MS);
  }

  function stopCounting(): void {
    if (clock.current) clearTimeout(clock.current);
    clock.current = null;
  }

  useEffect(() => stopCounting, []);

  return { start, stopCounting, wasHeld };
}

interface TileProps {
  page: ShortcutPage;
  index: number;
  isArranging: boolean;
  isDragged: boolean;
  offset: { dx: number; dy: number } | null;
  onHold: () => void;
  onRemove: () => void;
  onGo: () => void;
  onDown: (e: ReactPointerEvent<HTMLElement>, index: number) => void;
  onMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onRelease: () => void;
}

function Tile(props: TileProps) {
  const { page, index, isArranging, isDragged, offset, onRemove } = props;
  const { start, stopCounting, wasHeld } = useLongPress(props.onHold);
  const { Icon, label, route } = page;

  function startCounting(e: ReactPointerEvent<HTMLElement>): void {
    if (isArranging) {
      props.onDown(e, index);
      return;
    }
    start();
  }

  const style = offset ? { transform: `translate(${offset.dx}px, ${offset.dy}px)` } : undefined;
  const box = tileClass(isArranging, isDragged);

  const content = (
    <>
      <Icon className="size-6 shrink-0" aria-hidden={true} />
      <span className="line-clamp-2 text-2xs font-medium leading-tight">{label}</span>
    </>
  );

  return (
    <div className="relative" data-baldosa>
      {isArranging ? (
        <MovableTile
          isDragging={isDragged}
          label={label}
          style={style}
          onGrab={startCounting}
          onMove={props.onMove}
          onRelease={props.onRelease}
        >
          {content}
        </MovableTile>
      ) : (
        <TileLink
          route={route}
          className={box}
          longPress={{ startCounting, stopCounting, wasHeld }}
          onGo={props.onGo}
        >
          {content}
        </TileLink>
      )}

      {isArranging && <TileRemove label={label} onRemove={onRemove} />}
    </div>
  );
}

/** Fuera de la edición, la baldosa lleva a su página; mantenida, entra a editar. */
function TileLink({
  route,
  className,
  longPress,
  onGo,
  children,
}: {
  route: string;
  className: string;
  longPress: {
    startCounting: (e: ReactPointerEvent<HTMLElement>) => void;
    stopCounting: () => void;
    wasHeld: { current: boolean };
  };
  onGo: () => void;
  children: ReactNode;
}) {
  const { startCounting, stopCounting, wasHeld } = longPress;
  return (
    <Link
      to={route}
      className={className}
      onPointerDown={startCounting}
      onPointerUp={stopCounting}
      onPointerCancel={stopCounting}
      onPointerMove={stopCounting}
      onClick={(e) => {
        // Se mantuvo pulsada: la intención era editar, no ir.
        if (wasHeld.current) {
          e.preventDefault();
          return;
        }
        onGo();
      }}
    >
      {children}
    </Link>
  );
}
