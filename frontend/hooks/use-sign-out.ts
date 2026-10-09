'use client';

import { useClerk } from '@clerk/nextjs';
import { useState } from 'react';
import { clearSessionShoppingState } from '@/lib/session-handoff';
import { useAuthStore } from '@/store/auth-store';

/**
 * Signs out of Clerk and lands on the home page.
 *
 * The account's cart and wishlist are dropped from client state as soon as the
 * session is gone, so they are never visible to whoever uses this browser
 * next; they stay safe in MongoDB. `AuthProvider` does the same when it sees
 * Clerk's user disappear — doing it here as well means it never waits on a
 * render. If Clerk cannot be reached the session is still live, so nothing is
 * cleared and the button simply becomes available again.
 */
export function useSignOut() {
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);

  async function run() {
    if (pending) return;
    setPending(true);

    try {
      await signOut({ redirectUrl: '/' });
    } catch {
      // Clerk unreachable: still signed in, so there is nothing to clear.
      setPending(false);
      return;
    }

    useAuthStore.getState().setUser(null);
    clearSessionShoppingState();
    setPending(false);
  }

  return { signOut: run, pending };
}
