import { type RefObject, useEffect, useEffectEvent } from 'react';

/**
 * Deslizar para cerrar.
 *
 * ── Por qué no es un componente ─────────────────────────────────────────────
 * Porque no tiene forma. No hay nada que dibujar, ningún hueco que ocupar,
 * nada que Figma pudiera sostener. Tampoco tiene CSS propio: cada panel que
 * mueve ya declara su posición abierta y su posición cerrada, y esto solo pide
 * prestado el espacio que hay entre las dos.
 *
 * ── Hacia dónde ─────────────────────────────────────────────────────────────
 * `hacia` nombra la dirección que CIERRA, que es siempre la dirección por la
 * que el panel vino. Uno que subió desde abajo vuelve abajo; el de secciones,
 * que entró por la derecha, vuelve a la derecha. Cualquier otra cosa es un
 * gesto que hay que aprender en vez de adivinar.
 *
 * ── Eventos de puntero, nunca de tacto ──────────────────────────────────────
 * `touchstart/touchmove/touchend` no sirve: un navegador de escritorio a una
 * ventana angosta —que es como se revisa cada uno de estos paneles— no dispara
 * NINGÚN evento de tacto, así que el gesto no existía donde se probaba.
 */

/** Lo que hay que recorrer para que esto deje de ser un temblor. */
const RECOGNITION_PX = 8;

/**
 * Lo que hay que recorrer para que suelte.
 *
 * 120 y no 60: cerrar es lo caro de deshacer —hay que volver a abrir y volver
 * a llegar a donde uno estaba—, así que el umbral se pone donde ya no puede
 * ser un roce.
 */
export const CLOSE_THRESHOLD = 120;

export type SwipeDirection = 'down' | 'up' | 'right' | 'left';

const AXIS: Record<SwipeDirection, 'x' | 'y'> = {
  down: 'y',
  up: 'y',
  right: 'x',
  left: 'x',
};

/** Cuánto se ha avanzado HACIA el cierre. Negativo es ir al revés. */
export function progressAlong(direction: SwipeDirection, dx: number, dy: number): number {
  if (direction === 'down') return dy;
  if (direction === 'up') return -dy;
  if (direction === 'right') return dx;
  return -dx;
}

/** Lo que se mueve en el otro eje. Si manda esto, el gesto no es el nuestro. */
function crossOffset(direction: SwipeDirection, dx: number, dy: number): number {
  return Math.abs(AXIS[direction] === 'y' ? dx : dy);
}

/**
 * Si el gesto empezó dentro de algo que TODAVÍA puede desplazarse hacia allá.
 *
 * Porque entonces no es un cierre, es un desplazamiento: un panel cuya lista
 * está a la mitad se cierra solo cuando la lista ha vuelto a su borde.
 */
export function canScrollToward(
  from: Element | null,
  boundary: Element,
  direction: SwipeDirection,
): boolean {
  let node: Element | null = from;

  while (node && node !== boundary.parentElement) {
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(node) : null;
    const overflow = AXIS[direction] === 'y' ? style?.overflowY : style?.overflowX;
    // `auto` y `scroll` SON desplazables; `clip`, `hidden` y `visible` no.
    // Contarlos mal es exactamente el bug: el panel se mueve y la lista no.
    const isScrollable = overflow === 'auto' || overflow === 'scroll';

    if (isScrollable) {
      const remainingTop = node.scrollTop;
      const remainingBottom = node.scrollHeight - node.clientHeight - node.scrollTop;
      const remainingLeft = node.scrollLeft;
      const remainingRight = node.scrollWidth - node.clientWidth - node.scrollLeft;

      // Arrastrar hacia abajo enseña lo que hay ARRIBA: lo consume quien tenga
      // algo por encima todavía sin enseñar.
      const remaining =
        direction === 'down'
          ? remainingTop
          : direction === 'up'
            ? remainingBottom
            : direction === 'right'
              ? remainingLeft
              : remainingRight;

      if (remaining > 1) return true;
    }

    if (node === boundary) break;
    node = node.parentElement;
  }

  return false;
}

export function useSwipeToClose({
  element,
  direction,
  isEnabled,
  onClose,
}: {
  element: RefObject<HTMLElement | null>;
  direction: SwipeDirection;
  /** Solo mientras está abierto: un panel cerrado no se arrastra. */
  isEnabled: boolean;
  onClose: () => void;
}): void {
  /**
   * El cierre, como evento de efecto.
   *
   * Si el efecto dependiera de `onCerrar` —que en la práctica es una función
   * nueva en cada render— se volvería a enganchar cada vez, y su limpieza
   * borraría el `transform` en línea A MITAD DE UN ARRASTRE: el panel se
   * quedaría plantado bajo el dedo en cuanto cualquier otra cosa de la
   * pantalla se redibujara.
   *
   * `useEffectEvent` es la pieza de React para esto: una función estable que
   * llama siempre a la versión más reciente, sin entrar en las dependencias.
   * Antes era una ref escrita durante el render, que hace lo mismo a mano y
   * es lo que la regla de los refs prohíbe.
   */
  const handleClose = useEffectEvent(onClose);

  useEffect(() => {
    const el = element.current;
    if (!el || !isEnabled) return;

    const gesture: Drag = { el, direction, start: null, isRecognized: false, progress: 0 };
    const onPointerDown = (e: PointerEvent): void => startDrag(gesture, e);
    const onPointerMove = (e: PointerEvent): void => moveDrag(gesture, e);
    const onPointerUp = (): void => endDrag(gesture, () => handleClose());

    el.addEventListener('pointerdown', onPointerDown as EventListener);
    el.addEventListener('pointermove', onPointerMove as EventListener);
    el.addEventListener('pointerup', onPointerUp as EventListener);
    el.addEventListener('pointercancel', onPointerUp as EventListener);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown as EventListener);
      el.removeEventListener('pointermove', onPointerMove as EventListener);
      el.removeEventListener('pointerup', onPointerUp as EventListener);
      el.removeEventListener('pointercancel', onPointerUp as EventListener);
      releaseElement(el);
    };
  }, [element, direction, isEnabled]);
}

/** Un arrastre en curso sobre un panel. */
interface Drag {
  el: HTMLElement;
  direction: SwipeDirection;
  start: { x: number; y: number } | null;
  isRecognized: boolean;
  progress: number;
}

/** Devuelve el panel a lo que diga su CSS. */
function releaseElement(el: HTMLElement): void {
  el.style.transform = '';
  el.style.transition = '';
}

function startDrag(gesture: Drag, e: PointerEvent): void {
  if (e.button > 0) return;

  // El destino puede no ser un elemento —el documento, un nodo de texto—, y
  // esos no tienen `closest`.
  const target = e.target;
  // Una región que se maneja el puntero ella misma —una rejilla mientras
  // se reordena— se queda con el gesto entero.
  if (target instanceof Element && target.closest('[data-no-swipe]')) return;

  gesture.start = { x: e.clientX, y: e.clientY };
  gesture.isRecognized = false;
  gesture.progress = 0;
}

function moveDrag(gesture: Drag, e: PointerEvent): void {
  const { el, direction, start } = gesture;
  if (!start) return;

  const dx = e.clientX - start.x;
  const dy = e.clientY - start.y;
  gesture.progress = progressAlong(direction, dx, dy);

  if (!gesture.isRecognized && !recognize(gesture, e, crossOffset(direction, dx, dy))) return;

  // No se arrastra hacia el otro lado: el panel ya está en su sitio.
  const travel = Math.max(0, gesture.progress);
  el.style.transform =
    AXIS[direction] === 'y'
      ? `translateY(${direction === 'down' ? travel : -travel}px)`
      : `translateX(${direction === 'right' ? travel : -travel}px)`;
}

/** Decide si lo que empezó es este gesto. Si no lo es, lo abandona. */
function recognize(gesture: Drag, e: PointerEvent, crossOffset: number): boolean {
  const { el, direction, progress } = gesture;
  if (Math.abs(progress) < RECOGNITION_PX && crossOffset < RECOGNITION_PX) return false;

  // Va para el otro lado, o va de lado: no es este gesto.
  if (progress <= 0 || crossOffset > Math.abs(progress)) {
    gesture.start = null;
    return false;
  }

  if (canScrollToward(e.target as Element | null, el, direction)) {
    gesture.start = null;
    return false;
  }

  gesture.isRecognized = true;
  // jsdom no lo trae, aunque el tipo diga que todo elemento lo tiene.
  if ('setPointerCapture' in el) el.setPointerCapture(e.pointerId);
  // En línea y no en una clase: con su propia curva encima, el panel
  // llega tarde a donde ya está el dedo.
  el.style.transition = 'none';
  return true;
}

function endDrag(gesture: Drag, handleClose: () => void): void {
  if (!gesture.start || !gesture.isRecognized) {
    gesture.start = null;
    return;
  }
  gesture.start = null;
  gesture.isRecognized = false;

  if (gesture.progress <= CLOSE_THRESHOLD) {
    // Se queda: se suelta el control y su propia transición lo devuelve.
    releaseElement(gesture.el);
    return;
  }

  handleClose();

  /**
   * EL FOTOGRAMA SIGUIENTE, y ahí está todo el truco.
   *
   * Quitar el `transform` en línea ANTES de que el anfitrión cierre
   * devuelve el panel a su posición abierta durante un fotograma y lo
   * desliza desde allí: se lee como un rebote. Quitarlo un fotograma
   * DESPUÉS es lo que convierte un arrastre y una transición en un solo
   * movimiento continuo.
   */
  requestAnimationFrame(() => releaseElement(gesture.el));
}
