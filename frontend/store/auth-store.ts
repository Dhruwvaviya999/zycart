import { create } from 'zustand';
import type { AuthUser } from '@/types/user';

type AuthStatus = 'loading' | 'ready';

interface AuthState {
  user: AuthUser | null;
  /** `loading` only until the provider has run on the client. */
  status: AuthStatus;
  setUser: (user: AuthUser | null) => void;
}

/**
 * Deliberately holds nothing but the safe profile the API already returned.
 *
 * There is no token here and no persistence: the session belongs to Clerk,
 * and the API is the authority on which account it opens. This store exists so
 * client components can react to a sign-in or sign-out without a round trip,
 * not as a second source of truth.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  setUser: (user) => set({ user, status: 'ready' }),
}));

/**
 * Reads the signed-in user, falling back to the value the server rendered with
 * until the store has been seeded on the client.
 *
 * That fallback is what makes the first paint correct: the server already knows
 * who is signed in, so the navbar never renders a signed-out state for a frame
 * and hydration has nothing to reconcile.
 */
export function useAuthUser(serverUser: AuthUser | null): AuthUser | null {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  return status === 'ready' ? user : serverUser;
}
