import { type RefObject, useEffect, useEffectEvent } from 'react';

/**
 * Focus, while a surface covers the page.
 *
 * ── Why it is trapped ───────────────────────────────────────────────────────
 * A surface with a scrim already took the page away from the pointer. Letting
 * the tab key slip out behind it puts focus on controls that cannot be seen or
 * touched: it is worse than having no keyboard, because it looks like it works.
 *
 * ── The omission, and it is on purpose ──────────────────────────────────────
 * It STEPS ASIDE while a sheet is open. A movement opened from inside a panel
 * is a modal, and two traps fighting over the tab key are a keyboard that does
 * nothing.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function focusablesIn(box: HTMLElement): HTMLElement[] {
  return Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function useFocusTrap(box: RefObject<HTMLElement | null>, isActive: boolean): void {
  useEffect(() => {
    const el = box.current;
    if (!el || !isActive) return;

    // Where it came from, to give it back on close. Closing a panel and
    // leaving focus at the top of the page forces you to go through all of
    // it to get back to the button you just pressed.
    const returnTo = document.activeElement;

    /*
      Focus goes into the BOX, not into its first control.

      It has to go in —if it stays behind the scrim, the tab key keeps
      walking a page that cannot be seen—, but taking it to the first button
      or the first field opens the panel with something lit that nobody chose,
      which is exactly what the focus rule forbids. The box carries
      `tabindex="-1"` so it can receive it: it is focusable by hand but not in
      the tab order, so the first Tab takes you to the first control inside
      and from there you are on your way.
    */
    el.focus();

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Tab' || !el) return;
      // There is a sheet on top: the tab key is its own.
      if (document.querySelector('[data-modal]')) return;

      const focusables = focusablesIn(el);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // Empty: nowhere to go.
      if (first === undefined || last === undefined) {
        e.preventDefault();
        return;
      }

      const current = document.activeElement;

      if (e.shiftKey && (current === first || current === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // `activeElement` is any element: only HTML and SVG know how to take focus.
      if (returnTo instanceof HTMLElement || returnTo instanceof SVGElement) returnTo.focus();
    };
  }, [box, isActive]);
}

/** Escape closes. One of the four exits every surface has. */
export function useEscape(isActive: boolean, onClose: () => void): void {
  // As an effect event: `onClose` is usually a new function on every render,
  // and as a dependency it would remove and re-add the listener on each one.
  // `useEffectEvent` gives a stable function that always calls the latest.
  // It used to be a ref written during render, which is what the rule of
  // refs forbids.
  const handleClose = useEffectEvent(onClose);

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      // The sheet on top closes first: everyone understands Escape as
      // "remove the last thing I opened", not "remove everything".
      if (e.key === 'Escape' && !document.querySelector('[data-modal]')) handleClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isActive]);
}
