import { useState } from 'react';

/**
 * Reacts to something from outside changing, DURING the render.
 *
 * ── What it replaces ────────────────────────────────────────────────────────
 * This:
 *
 *   useEffect(() => { setX(outsideValue); }, [outsideValue]);
 *
 * which is how this app used to reset a sheet's state on opening it, keep a
 * text field in step with the value it received, or close the panels on
 * changing page. Twelve places, the same gesture.
 *
 * ── Why in the render and not in an effect ──────────────────────────────────
 * An effect runs AFTER painting. So the sequence was: the sheet paints with
 * the previous movement's data, the effect runs, it paints again with the
 * right data. One frame with stale data, and one extra render every time. In
 * a sheet of fifteen fields that is fifteen states changing in two batches
 * instead of one.
 *
 * Adjusting state during the render is what React documents for this case:
 * if a `setState` is called while the component is rendering, React discards
 * that render and starts over with the new state, before touching the DOM.
 * There is no intermediate frame.
 *
 * ── It is faithful to `useEffect`, on purpose ───────────────────────────────
 * Two things that could have been «improved» and were left alone, because
 * this replaces twelve effects that already worked and the rule was not to
 * change what the screen does:
 *
 *   · It also fires on MOUNT, like an effect. A sheet that mounts already
 *     open fills in the same as one that opens later.
 *   · It compares each element with `Object.is`, like the dependency array.
 *     A new object with the same contents counts as a change, as it did
 *     before.
 *
 * ── What it is NOT ──────────────────────────────────────────────────────────
 * It is not for real effects: a subscription, a request, a browser resource
 * that has to be released. That is still a `useEffect` with its cleanup. This
 * is only for «when this changes, the state has to say that».
 */
export function useOnChange(signature: readonly unknown[], react: () => void): void {
  // `null` and not `signature`: that way the first pass always counts as a
  // change and the reaction runs on mount, which is what the effect did.
  const [previous, setPrevious] = useState<readonly unknown[] | null>(null);

  const hasChanged =
    previous?.length !== signature.length ||
    previous.some((value, i) => !Object.is(value, signature[i]));

  if (hasChanged) {
    setPrevious(signature);
    react();
  }
}
