import { useSyncExternalStore } from 'react';

import { isInNativeApp } from './bridge';

/**
 * THE BREAKPOINT. Just one, and it asks TWO questions.
 *
 * ── Why orientation and not just width ──────────────────────────────────────
 * A tablet is between 768 and 1024 points wide. An iPad in portrait sits
 * ABOVE any 767px line, so it would get the desktop screen —rail on the left
 * and all— inside a phone-shaped column. Turned, the same device measures
 * 1024 to 1366, and there the desktop is the right thing.
 *
 * So the question is never "how wide" but "how wide AND which way up". 1024
 * is the ceiling because it is the widest iPad in portrait: the 12.9-inch
 * one, 1024×1366.
 *
 * ── Why two strings and not one negated ─────────────────────────────────────
 * Because `not` over a list of conditions does not behave as you would expect
 * in a media query. Written by hand, the two have to be COMPLEMENTARY:
 * nothing may fall in both or in neither. That is not left to the eye —
 * `mobile.test.ts` checks it over a sweep of sizes.
 *
 * ── Where the CSS copy lives ────────────────────────────────────────────────
 * In `index.css`, as `@custom-variant movil` and `@custom-variant escritorio`.
 * Tailwind does know how to name a media query, so classes say `movil:` and
 * `escritorio:` and the string is not repeated across the project. This one
 * and that one are the only two; the test checks that they say the same
 * thing, character by character.
 */
export const MOBILE_QUERY = '(max-width: 767px), (orientation: portrait) and (max-width: 1024px)';

export const DESKTOP_QUERY = '(min-width: 1025px), (orientation: landscape) and (min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  const mediaList = window.matchMedia(MOBILE_QUERY);
  mediaList.addEventListener('change', onChange);
  return () => mediaList.removeEventListener('change', onChange);
}

/**
 * Whether we are below the breakpoint.
 *
 * It is used to MOUNT or not mount —the bottom bar, the sections panel—, not
 * for styling: that is what the `movil:` and `escritorio:` variants are for.
 *
 * Mount and not hide, because a rail hidden with CSS is still nine links in
 * the tab order, and a panel hidden with CSS is a second copy of every `id`
 * inside it.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    // A render without a window has no width to measure. Desktop is the least
    // destructive answer: it paints the rail, which is what the served HTML
    // already had.
    () => false,
  );
}

/**
 * Whether the web runs INSIDE the phone app.
 *
 * It lives next to `useIsMobile` because it answers the same kind of question:
 * what gets MOUNTED. Embedded, the bottom bar, the top bar and the account
 * sheet are not mounted —the native bar and the «Más» tab do that job—.
 *
 * It is not a `useSyncExternalStore`: the answer does not change for the
 * whole life of the page. The app sets the `User-Agent` and the bridge when it
 * creates the webview, before loading anything, and there is no way into or
 * out of the app without reloading the document.
 */
// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- rename belongs to step 7.2
export function useIsInNativeApp(): boolean {
  return isInNativeApp();
}
