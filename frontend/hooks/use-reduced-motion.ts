'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/**
 * Whether this reader has asked for less movement.
 *
 * The global stylesheet already flattens every CSS animation and transition
 * for them, but a component that moves *on a timer* is not something CSS can
 * switch off — the timer has to be told. Anything that rotates, auto-advances
 * or scrolls by itself reads this and stops.
 *
 * Returns `false` on the server: the preference is only knowable in the
 * browser, and the un-reduced render is the one that matches the markup.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
