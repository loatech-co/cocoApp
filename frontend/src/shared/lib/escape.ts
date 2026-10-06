import { useEffect } from 'react';

/**
 * Escape cierra lo que está abierto.
 *
 * Un panel que solo se cierra con su propio botón obliga a apuntar con el
 * ratón para deshacer lo que se abrió sin querer. Lo usan la ficha y la
 * confirmación; un desplegable tiene su propio Escape en `Menu`.
 */
export function useEscapeToClose(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);
}
