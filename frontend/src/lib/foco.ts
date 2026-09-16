import { useEffect, useRef, type RefObject } from 'react';

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

    const primero = enfocables(el)[0];
    (primero ?? el).focus?.();

    function alPulsar(e: KeyboardEvent): void {
      if (e.key !== 'Tab' || !el) return;
      // Hay una ficha encima: el tabulador es suyo.
      if (document.querySelector('[data-modal]')) return;

      const lista = enfocables(el);
      if (lista.length === 0) {
        e.preventDefault();
        return;
      }

      const primero = lista[0]!;
      const ultimo = lista[lista.length - 1]!;
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
  // En una caja que no cambia de identidad: `onCerrar` suele ser una función
  // nueva en cada render, y sin esto el oyente se quita y se pone en cada uno.
  const alCerrar = useRef(onCerrar);
  alCerrar.current = onCerrar;

  useEffect(() => {
    if (!activo) return;
    const alPulsar = (e: KeyboardEvent): void => {
      // La ficha de encima cierra primero: Escape lo entiende todo el mundo
      // como "quita lo último que abrí", no "quítalo todo".
      if (e.key === 'Escape' && !document.querySelector('[data-modal]')) alCerrar.current();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [activo]);
}
