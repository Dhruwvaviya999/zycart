'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { activeNavLabel } from '@/lib/nav-active';
import type { NavLink } from '@/data/navigation';

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/**
 * The location hash, as a value React is allowed to render.
 *
 * `usePathname` deliberately excludes it and there is no Next hook that
 * reports it, so it is read from the document through the one API that keeps
 * the server's render and the client's first render in agreement. The server
 * has no hash, so it renders none, and the first client pass agrees before
 * `hashchange` moves it.
 */
function useLocationHash(): string {
  return useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => '',
  );
}

/**
 * The label of the navigation item the current route belongs to, or `null`.
 *
 * Every surface that draws an active state calls this, so the desktop bar and
 * the mobile sheet cannot drift apart, and nothing anywhere sets the active
 * item by hand on click — the URL is the only thing that decides.
 *
 * Callers must sit under a `<Suspense>` boundary, because `useSearchParams`
 * opts its subtree into client rendering.
 */
export function useActiveNav(items: NavLink[]): string | null {
  const pathname = usePathname();
  const params = useSearchParams();
  const hash = useLocationHash();

  return activeNavLabel(items, { pathname, params, hash });
}
