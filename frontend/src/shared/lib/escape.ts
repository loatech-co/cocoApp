import { useEffect } from 'react';

/**
 * Escape closes what is open.
 *
 * A panel that only closes with its own button forces you to aim with the
 * mouse to undo what was opened by accident. The sheet and the confirmation
 * use it; a dropdown has its own Escape in `Menu`.
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
