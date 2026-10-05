import { useEffect } from 'react';

/**
 * Escape cierra lo que está abierto.
 *
 * Un panel que solo se cierra con su propio botón obliga a apuntar con el
 * ratón para deshacer lo que se abrió sin querer. Lo usan la ficha y la
 * confirmación; un desplegable tiene su propio Escape en `Menu`.
 */
export function useEscapeToClose(abierta: boolean, onCerrar: () => void): void {
  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierta, onCerrar]);
}
