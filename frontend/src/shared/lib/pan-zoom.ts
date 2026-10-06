import {
  type CSSProperties,
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useOnChange } from './on-change';

interface Size {
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

/** La caja de un elemento, medida otra vez cada vez que cambia de tamaño. */
function useMeasuredBox(ref: RefObject<HTMLElement | null>): Size {
  const [box, setBox] = useState<Size>({ width: 0, height: 0 });

  // La caja cambia de tamaño con la ventana, y los topes dependen de ella.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = (): void =>
      setBox({ width: element.clientWidth, height: element.clientHeight });

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return box;
}

/** Arrastrar con `pointer`: el mismo código sirve para el ratón, el dedo y el lápiz. */
function useDragToPan(isEnabled: boolean, pos: Point, onMove: (to: Point) => void) {
  const grip = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const release = (): void => {
    grip.current = null;
    setIsDragging(false);
  };

  return {
    isDragging,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (!isEnabled) return;
        /*
          Los mandos del zoom no arrastran nada.

          Aquí estaba el bug que hacía que el zoom "no funcionara": al pulsar
          un mando, este marco tomaba `setPointerCapture` para el arrastre, y
          la captura REDIRIGE también el `click` al elemento que capturó. El
          estado del zoom nunca cambiaba porque el `onClick` del botón no
          llegaba a dispararse nunca.
        */
        if ((e.target as HTMLElement).closest('[data-zoom-controls]')) return;

        e.currentTarget.setPointerCapture(e.pointerId);
        grip.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY };
        setIsDragging(true);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const origin = grip.current;
        if (!origin) return;
        onMove({ x: origin.x + (e.clientX - origin.px), y: origin.y + (e.clientY - origin.py) });
      },
      onPointerUp: release,
      onPointerCancel: release,
    },
  };
}

/**
 * Un documento que LLENA su caja y se recorre arrastrando.
 *
 * ── Por qué llena la caja y no entra entera ─────────────────────────────────
 * Porque una hoja completa metida en una caja baja deja la letra a un tamaño
 * en el que el total no se lee. Llenando la caja, el documento se ve al tamaño
 * en que se puede comprobar, y lo que no cabe se alcanza arrastrando.
 *
 * ── Los topes ───────────────────────────────────────────────────────────────
 * El desplazamiento se recorta a lo que falta por ver, así que nunca aparece
 * un hueco: el borde del documento no pasa del borde de la caja. Y si por el
 * lado corto el documento cabe justo, ese eje no se mueve —en vez de temblar
 * un píxel en cada arrastre—.
 *
 * `pasos` son los saltos del zoom, como múltiplos de la escala que llena la
 * caja; el primero es el 100 %. `marco` es la caja: la crea quien la pinta.
 */
export function usePanZoom(frame: RefObject<HTMLElement | null>, steps: readonly number[]) {
  const box = useMeasuredBox(frame);
  /** El tamaño natural de lo dibujado, para saber cuánto sobra por cada lado. */
  const [natural, setNatural] = useState<Size | null>(null);
  const [pos, setPos] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0);

  // La escala que LLENA la caja: la mayor de las dos proporciones. Con la
  // menor —que es `contain`— quedarían franjas vacías a los lados.
  const coverScale =
    natural && box.width > 0 ? Math.max(box.width / natural.width, box.height / natural.height) : 1;
  // `zoom` nunca sale de `pasos`: los botones lo recortan.
  const step = steps[zoom] ?? 1;
  const scale = coverScale * step;
  const width = natural ? natural.width * scale : 0;
  const height = natural ? natural.height * scale : 0;

  /** Cuánto se puede mover cada eje. Negativo: es lo que sobra por ver. */
  const bounds = { x: Math.min(0, box.width - width), y: Math.min(0, box.height - height) };
  const clamp = ({ x, y }: Point): Point => ({
    x: Math.min(0, Math.max(bounds.x, x)),
    y: Math.min(0, Math.max(bounds.y, y)),
  });

  // Empieza CENTRADO, y se recentra al cambiar el zoom: ampliar desde una
  // esquina deja mirando un margen en blanco en vez de lo que se estaba
  // leyendo. Solo al cambiar el documento, la caja o el zoom: recentrar en
  // cada arrastre pelearía con el dedo.
  useOnChange([natural, box.width, box.height, zoom], () => {
    if (!natural || box.width === 0) return;
    setPos(clamp({ x: bounds.x / 2, y: bounds.y / 2 }));
  });

  const canPan = bounds.x < 0 || bounds.y < 0;
  const drag = useDragToPan(canPan, pos, (a) => setPos(clamp(a)));

  const framing: CSSProperties = {
    position: 'absolute',
    left: pos.x,
    top: pos.y,
    width: width || undefined,
    height: height || undefined,
    // Antes de medir se pinta invisible: un fotograma con el documento a su
    // tamaño natural y sin encuadrar se ve como un salto.
    visibility: natural ? 'visible' : 'hidden',
  };

  return { setNatural, zoom, setZoom, step, framing, canPan, ...drag };
}
