'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { syncCurrentUser } from '@/services/auth.service';
import { clearSessionShoppingState } from '@/lib/session-handoff';
import { useAuthStore } from '@/store/auth-store';
import type { AuthUser } from '@/types/user';

interface AuthProviderProps {
  user: AuthUser | null;
  children: React.ReactNode;
}

/**
 * Keeps the client's idea of the session in step with the server's and Clerk's.
 *
 * Three jobs:
 *
 *  - **Seeding.** The server-resolved account is copied into the client store.
 *    Seeding happens in an effect rather than during render on purpose: the
 *    store is a module singleton, and writing to it while rendering on the
 *    server would let one request's session leak into another's. The effect
 *    only ever runs in the browser, and `useAuthUser` covers the first paint
 *    from the server value.
 *  - **Signing in and out.** Clerk's forms run in the browser, so the moment
 *    Clerk's user changes is noticed here: a sign-in fetches the account; a
 *    sign-out drops the account's shopping state so it is never shown to
 *    whoever uses the browser next. Either way the server components re-run.
 *  - **Profile changes.** A name or address edited in Clerk's profile is
 *    synced to the account at once, rather than whenever the webhook lands.
 *
 * Only *changes* are acted on. The first value Clerk reports is the session
 * this page was rendered with, which the server already accounted for.
 */
export function AuthProvider({ user, children }: AuthProviderProps) {
  const router = useRouter();
  const { isLoaded, userId } = useAuth();
  const { user: clerkUser } = useUser();

  useEffect(() => {
    const { user: current, status, setUser } = useAuthStore.getState();

    // The prop is a fresh object on every server render; only a real change in
    // identity should notify subscribers.
    if (status === 'loading' || current?.id !== user?.id) {
      setUser(user);
    }
  }, [user]);

  const seenUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;

    const current = userId ?? null;
    const previous = seenUserId.current;
    seenUserId.current = current;

    if (previous === undefined || previous === current) return;

    if (!current) {
      useAuthStore.getState().setUser(null);
      clearSessionShoppingState();
      router.refresh();
      return;
    }

    // The refresh hands the new account to `ShopSync`, which folds in the bag
    // and saved products built while signed out.
    void syncCurrentUser().then((account) => {
      useAuthStore.getState().setUser(account);
      router.refresh();
    });
  }, [isLoaded, userId, router]);

  const seenRevision = useRef<string | undefined>(undefined);
  const revision = clerkUser ? `${clerkUser.id}:${clerkUser.updatedAt?.getTime() ?? 0}` : undefined;

  useEffect(() => {
    if (!revision) return;

    const previous = seenRevision.current;
    seenRevision.current = revision;

    // A different user is a sign-in, handled above; only the same user, changed, is synced here.
    if (!previous || previous.split(':')[0] !== revision.split(':')[0] || previous === revision) {
      return;
    }

    void syncCurrentUser().then((account) => {
      if (!account) return;
      useAuthStore.getState().setUser(account);
      router.refresh();
    });
  }, [revision, router]);

  return children;
}
