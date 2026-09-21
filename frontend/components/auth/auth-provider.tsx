'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';
import type { AuthUser } from '@/types/user';

interface AuthProviderProps {
  user: AuthUser | null;
  children: React.ReactNode;
}

/**
 * Copies the server-resolved session into the client store.
 *
 * Seeding happens in an effect rather than during render on purpose: the store
 * is a module singleton, and writing to it while rendering on the server would
 * let one request's session leak into another's. The effect only ever runs in
 * the browser, and `useAuthUser` covers the first paint from the server value.
 */
export function AuthProvider({ user, children }: AuthProviderProps) {
  useEffect(() => {
    const { user: current, status, setUser } = useAuthStore.getState();

    // The prop is a fresh object on every server render; only a real change in
    // identity should notify subscribers.
    if (status === 'loading' || current?.id !== user?.id) {
      setUser(user);
    }
  }, [user]);

  return children;
}
