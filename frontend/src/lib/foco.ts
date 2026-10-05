import { type RefObject, useEffect, useEffectEvent } from 'react';

/**
 * El foco, mientras una superficie tapa la página.
 *
 * ── Por qué se atrapa ───────────────────────────────────────────────────────
 * Una superficie con velo ya le quitó la página al puntero. Dejar que el
 * tabulador se salga por detrás pone el foco en controles que no se ven y no
 * se pueden tocar: es peor que no tener teclado, porque parece que funciona.
 *
 * ── La omisión, y es a propósito ────────────────────────────────────────────
 * Se APARTA mientras hay una ficha abierta. Un movimiento abierto desde dentro
 * de un panel es un modal, y dos trampas peleándose por el tabulador son un
 * teclado que no hace nada.
 */
const ENFOCABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function enfocables(caja: HTMLElement): HTMLElement[] {
  return Array.from(caja.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function useFocoAtrapado(caja: RefObject<HTMLElement | null>, activo: boolean): void {
  useEffect(() => {
    const el = caja.current;
    if (!el || !activo) return;

    // De dónde se vino, para devolverlo al cerrar. Cerrar un panel y dejar el
    // foco al principio de la página obliga a recorrerla entera para volver al
    // botón que se acaba de pulsar.
    const volverA = document.activeElement as HTMLElement | null;

    /*
      El foco entra en la CAJA, no en su primer control.

      Tiene que entrar —si se queda detrás del velo, el tabulador sigue
      recorriendo una página que no se ve—, pero llevarlo al primer botón o al
      primer campo abre el panel con algo encendido que nadie eligió, que es
      justo lo que la regla del foco prohíbe. La caja lleva `tabindex="-1"`
      para poder recibirlo: es enfocable a mano pero no está en el recorrido
      del tabulador, así que el primer Tab lleva al primer control de dentro y
      desde ahí ya se anda.
    */
    el.focus?.();

    function alPulsar(e: KeyboardEvent): void {
      if (e.key !== 'Tab' || !el) return;
      // Hay una ficha encima: el tabulador es suyo.
      if (document.querySelector('[data-modal]')) return;

      const lista = enfocables(el);
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      // Vacía: no hay a dónde ir.
      if (primero === undefined || ultimo === undefined) {
        e.preventDefault();
        return;
      }

      const actual = document.activeElement;

      if (e.shiftKey && (actual === primero || actual === el)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && actual === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener('keydown', alPulsar);
    return () => {
      document.removeEventListener('keydown', alPulsar);
      volverA?.focus?.();
    };
  }, [caja, activo]);
}

/** Escape cierra. Una de las cuatro salidas que tiene toda superficie. */
export function useEscape(activo: boolean, onCerrar: () => void): void {
  // Como evento de efecto: `onCerrar` suele ser una función nueva en cada
  // render, y como dependencia haría que el oyente se quitara y se pusiera en
  // cada uno. `useEffectEvent` da una función estable que llama siempre a la
  // más reciente. Antes era una ref escrita durante el render, que es lo que
  // la regla de los refs prohíbe.
  const alCerrar = useEffectEvent(onCerrar);

  useEffect(() => {
    if (!activo) return;
    const alPulsar = (e: KeyboardEvent): void => {
      // La ficha de encima cierra primero: Escape lo entiende todo el mundo
      // como "quita lo último que abrí", no "quítalo todo".
      if (e.key === 'Escape' && !document.querySelector('[data-modal]')) alCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [activo]);
}
