import { useEffect, useRef, type RefObject } from 'react';

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
const RECONOCIMIENTO = 8;

/**
 * Lo que hay que recorrer para que suelte.
 *
 * 120 y no 60: cerrar es lo caro de deshacer —hay que volver a abrir y volver
 * a llegar a donde uno estaba—, así que el umbral se pone donde ya no puede
 * ser un roce.
 */
export const UMBRAL_DE_CIERRE = 120;

export type Cierre = 'abajo' | 'arriba' | 'derecha' | 'izquierda';

const EJE: Record<Cierre, 'x' | 'y'> = {
  abajo: 'y',
  arriba: 'y',
  derecha: 'x',
  izquierda: 'x',
};

/** Cuánto se ha avanzado HACIA el cierre. Negativo es ir al revés. */
export function avanceDe(hacia: Cierre, dx: number, dy: number): number {
  if (hacia === 'abajo') return dy;
  if (hacia === 'arriba') return -dy;
  if (hacia === 'derecha') return dx;
  return -dx;
}

/** Lo que se mueve en el otro eje. Si manda esto, el gesto no es el nuestro. */
function cruceDe(hacia: Cierre, dx: number, dy: number): number {
  return Math.abs(EJE[hacia] === 'y' ? dx : dy);
}

/**
 * Si el gesto empezó dentro de algo que TODAVÍA puede desplazarse hacia allá.
 *
 * Porque entonces no es un cierre, es un desplazamiento: un panel cuya lista
 * está a la mitad se cierra solo cuando la lista ha vuelto a su borde.
 */
export function puedeDesplazarse(desde: Element | null, hasta: Element, hacia: Cierre): boolean {
  let nodo: Element | null = desde;

  while (nodo && nodo !== hasta.parentElement) {
    const estilo = typeof getComputedStyle === 'function' ? getComputedStyle(nodo) : null;
    const desborde = EJE[hacia] === 'y' ? estilo?.overflowY : estilo?.overflowX;
    // `auto` y `scroll` SON desplazables; `clip`, `hidden` y `visible` no.
    // Contarlos mal es exactamente el bug: el panel se mueve y la lista no.
    const desplazable = desborde === 'auto' || desborde === 'scroll';

    if (desplazable) {
      const restanteArriba = nodo.scrollTop;
      const restanteAbajo = nodo.scrollHeight - nodo.clientHeight - nodo.scrollTop;
      const restanteIzquierda = nodo.scrollLeft;
      const restanteDerecha = nodo.scrollWidth - nodo.clientWidth - nodo.scrollLeft;

      // Arrastrar hacia abajo enseña lo que hay ARRIBA: lo consume quien tenga
      // algo por encima todavía sin enseñar.
      const restante =
        hacia === 'abajo'
          ? restanteArriba
          : hacia === 'arriba'
            ? restanteAbajo
            : hacia === 'derecha'
              ? restanteIzquierda
              : restanteDerecha;

      if (restante > 1) return true;
    }

    if (nodo === hasta) break;
    nodo = nodo.parentElement;
  }

  return false;
}

export function useDeslizarParaCerrar({
  elemento,
  hacia,
  activo,
  onCerrar,
}: {
  elemento: RefObject<HTMLElement | null>;
  hacia: Cierre;
  /** Solo mientras está abierto: un panel cerrado no se arrastra. */
  activo: boolean;
  onCerrar: () => void;
}): void {
  /**
   * El cierre, guardado en una caja que no cambia de identidad.
   *
   * Si el efecto dependiera de `onCerrar` —que en la práctica es una función
   * nueva en cada render— se volvería a enganchar cada vez, y su limpieza
   * borraría el `transform` en línea A MITAD DE UN ARRASTRE: el panel se
   * quedaría plantado bajo el dedo en cuanto cualquier otra cosa de la
   * pantalla se redibujara.
   */
  const alCerrar = useRef(onCerrar);
  alCerrar.current = onCerrar;

  useEffect(() => {
    const el = elemento.current;
    if (!el || !activo) return;

    let inicio: { x: number; y: number } | null = null;
    let reconocido = false;
    let avance = 0;

    /** Devuelve el panel a lo que diga su CSS. */
    function soltarElControl(): void {
      if (!el) return;
      el.style.transform = '';
      el.style.transition = '';
    }

    function alBajar(e: PointerEvent): void {
      if (e.button != null && e.button > 0) return;

      const objetivo = e.target as Element | null;
      // Una región que se maneja el puntero ella misma —una rejilla mientras
      // se reordena— se queda con el gesto entero.
      if (objetivo?.closest?.('[data-sin-deslizar]')) return;

      inicio = { x: e.clientX, y: e.clientY };
      reconocido = false;
      avance = 0;
    }

    function alMover(e: PointerEvent): void {
      if (!inicio || !el) return;

      const dx = e.clientX - inicio.x;
      const dy = e.clientY - inicio.y;
      avance = avanceDe(hacia, dx, dy);

      if (!reconocido) {
        const cruce = cruceDe(hacia, dx, dy);
        if (Math.abs(avance) < RECONOCIMIENTO && cruce < RECONOCIMIENTO) return;

        // Va para el otro lado, o va de lado: no es este gesto.
        if (avance <= 0 || cruce > Math.abs(avance)) {
          inicio = null;
          return;
        }

        if (puedeDesplazarse(e.target as Element | null, el, hacia)) {
          inicio = null;
          return;
        }

        reconocido = true;
        el.setPointerCapture?.(e.pointerId);
        // En línea y no en una clase: con su propia curva encima, el panel
        // llega tarde a donde ya está el dedo.
        el.style.transition = 'none';
      }

      // No se arrastra hacia el otro lado: el panel ya está en su sitio.
      const recorrido = Math.max(0, avance);
      el.style.transform =
        EJE[hacia] === 'y'
          ? `translateY(${hacia === 'abajo' ? recorrido : -recorrido}px)`
          : `translateX(${hacia === 'derecha' ? recorrido : -recorrido}px)`;
    }

    function alSoltar(): void {
      if (!inicio || !reconocido) {
        inicio = null;
        return;
      }
      inicio = null;
      reconocido = false;

      if (avance <= UMBRAL_DE_CIERRE) {
        // Se queda: se suelta el control y su propia transición lo devuelve.
        soltarElControl();
        return;
      }

      alCerrar.current();

      /**
       * EL FOTOGRAMA SIGUIENTE, y ahí está todo el truco.
       *
       * Quitar el `transform` en línea ANTES de que el anfitrión cierre
       * devuelve el panel a su posición abierta durante un fotograma y lo
       * desliza desde allí: se lee como un rebote. Quitarlo un fotograma
       * DESPUÉS es lo que convierte un arrastre y una transición en un solo
       * movimiento continuo.
       */
      requestAnimationFrame(soltarElControl);
    }

    el.addEventListener('pointerdown', alBajar as EventListener);
    el.addEventListener('pointermove', alMover as EventListener);
    el.addEventListener('pointerup', alSoltar as EventListener);
    el.addEventListener('pointercancel', alSoltar as EventListener);

    return () => {
      el.removeEventListener('pointerdown', alBajar as EventListener);
      el.removeEventListener('pointermove', alMover as EventListener);
      el.removeEventListener('pointerup', alSoltar as EventListener);
      el.removeEventListener('pointercancel', alSoltar as EventListener);
      soltarElControl();
    };
  }, [elemento, hacia, activo]);
}
