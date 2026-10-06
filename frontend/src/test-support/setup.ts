/**
 * What jsdom does not ship and the code does need.
 *
 * ── `matchMedia` ────────────────────────────────────────────────────────────
 * jsdom does not implement it, and since `Menu` asks whether it is below the
 * breakpoint —to open as a sheet instead of hanging from the button— half the
 * app goes through there: a dropdown, a date picker, a filter. Without this,
 * thirty tests that have nothing to do with the phone fail with
 * «window.matchMedia is not a function».
 *
 * It answers that it is NOT a phone, which is the same answer the code gives
 * when there is no window to measure: it paints the rail and the dropdowns
 * hang from their button, which is what almost every test is looking at. A
 * test that wants the other answer writes it itself —`app-shell.test.tsx`
 * does—, and that is why this is only set if nothing is set.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
