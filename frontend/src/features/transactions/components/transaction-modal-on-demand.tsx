import { lazy, Suspense, useEffect, type ComponentProps } from 'react';

import type { TransactionModal } from './transaction-modal';

/*
  The transaction sheet is its own chunk (ADR 0018, step J-6c). With the
  camera, the receipt viewer, the reading and the form it was the largest
  piece of the entry bundle, and nobody needs it for the first paint: it opens
  when someone taps a row or «Nuevo movimiento».

  So that tapping does not wait for the network, the chunk is fetched as soon
  as the browser is idle after the dashboard draws. The import is the same
  promise every time: the module system caches it.
*/
const load = () => import('./transaction-modal').then((m) => ({ default: m.TransactionModal }));
const LazyTransactionModal = lazy(load);

function preloadWhenIdle(): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => void load());
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(() => void load(), 1);
  return () => window.clearTimeout(id);
}

/**
 * `TransactionModal`, loaded on demand. Same props; closed, it renders nothing
 * —which the sheet already did, and its form resets on every opening, so
 * mounting it only while open loses no state.
 */
export function TransactionModalOnDemand(props: ComponentProps<typeof TransactionModal>) {
  useEffect(preloadWhenIdle, []);
  if (!props.isOpen) return null;
  return (
    <Suspense fallback={null}>
      <LazyTransactionModal {...props} />
    </Suspense>
  );
}
