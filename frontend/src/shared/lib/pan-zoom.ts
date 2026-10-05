import {
  type CSSProperties,
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useAlCambiar } from './al-cambiar';

interface Size {
  ancho: number;
  alto: number;
}

interface Point {
  x: number;
  y: number;
}

/** La caja de un elemento, medida otra vez cada vez que cambia de tamaño. */
function useMeasuredBox(ref: RefObject<HTMLElement | null>): Size {
  const [box, setBox] = useState<Size>({ ancho: 0, alto: 0 });

  // La caja cambia de tamaño con la ventana, y los topes dependen de ella.
  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;

    const medir = (): void => setBox({ ancho: elemento.clientWidth, alto: elemento.clientHeight });

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [ref]);

  return box;
}

/** Arrastrar con `pointer`: el mismo código sirve para el ratón, el dedo y el lápiz. */
function useDragToPan(enabled: boolean, pos: Point, onMove: (to: Point) => void) {
  const agarre = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const soltar = (): void => {
    agarre.current = null;
    setArrastrando(false);
  };

  return {
    arrastrando,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (!enabled) return;
        /*
          Los mandos del zoom no arrastran nada.

          Aquí estaba el bug que hacía que el zoom "no funcionara": al pulsar
          un mando, este marco tomaba `setPointerCapture` para el arrastre, y
          la captura REDIRIGE también el `click` al elemento que capturó. El
          estado del zoom nunca cambiaba porque el `onClick` del botón no
          llegaba a dispararse nunca.
        */
        if ((e.target as HTMLElement).closest('[data-mandos]')) return;

        e.currentTarget.setPointerCapture(e.pointerId);
        agarre.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY };
        setArrastrando(true);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const desde = agarre.current;
        if (!desde) return;
        onMove({ x: desde.x + (e.clientX - desde.px), y: desde.y + (e.clientY - desde.py) });
      },
      onPointerUp: soltar,
      onPointerCancel: soltar,
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
export function usePanZoom(marco: RefObject<HTMLElement | null>, pasos: readonly number[]) {
  const caja = useMeasuredBox(marco);
  /** El tamaño natural de lo dibujado, para saber cuánto sobra por cada lado. */
  const [natural, setNatural] = useState<Size | null>(null);
  const [pos, setPos] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0);

  // La escala que LLENA la caja: la mayor de las dos proporciones. Con la
  // menor —que es `contain`— quedarían franjas vacías a los lados.
  const cubrir =
    natural && caja.ancho > 0 ? Math.max(caja.ancho / natural.ancho, caja.alto / natural.alto) : 1;
  // `zoom` nunca sale de `pasos`: los botones lo recortan.
  const paso = pasos[zoom] ?? 1;
  const escala = cubrir * paso;
  const ancho = natural ? natural.ancho * escala : 0;
  const alto = natural ? natural.alto * escala : 0;

  /** Cuánto se puede mover cada eje. Negativo: es lo que sobra por ver. */
  const limite = { x: Math.min(0, caja.ancho - ancho), y: Math.min(0, caja.alto - alto) };
  const recortar = ({ x, y }: Point): Point => ({
    x: Math.min(0, Math.max(limite.x, x)),
    y: Math.min(0, Math.max(limite.y, y)),
  });

  // Empieza CENTRADO, y se recentra al cambiar el zoom: ampliar desde una
  // esquina deja mirando un margen en blanco en vez de lo que se estaba
  // leyendo. Solo al cambiar el documento, la caja o el zoom: recentrar en
  // cada arrastre pelearía con el dedo.
  useAlCambiar([natural, caja.ancho, caja.alto, zoom], () => {
    if (!natural || caja.ancho === 0) return;
    setPos(recortar({ x: limite.x / 2, y: limite.y / 2 }));
  });

  const sePuedeMover = limite.x < 0 || limite.y < 0;
  const arrastre = useDragToPan(sePuedeMover, pos, (a) => setPos(recortar(a)));

  const encuadre: CSSProperties = {
    position: 'absolute',
    left: pos.x,
    top: pos.y,
    width: ancho || undefined,
    height: alto || undefined,
    // Antes de medir se pinta invisible: un fotograma con el documento a su
    // tamaño natural y sin encuadrar se ve como un salto.
    visibility: natural ? 'visible' : 'hidden',
  };

  return { setNatural, zoom, setZoom, paso, encuadre, sePuedeMover, ...arrastre };
}
