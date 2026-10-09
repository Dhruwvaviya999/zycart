import { request, send, type RequestOptions } from '@/services/api';
import type { AuthUser } from '@/types/user';

/**
 * Signing in, signing up and signing out are Clerk's (see `@clerk/nextjs`).
 * What the API answers is the ZyCart account behind a Clerk session.
 */

export function getCurrentUser(options?: RequestOptions): Promise<AuthUser> {
  return request<AuthUser>('/api/auth/me', undefined, options);
}

/**
 * Being signed out is the normal state for most visitors, not an error — every
 * caller that just wants to know "who is this, if anyone" uses this variant so
 * a 401 never reaches an error boundary.
 *
 * A genuine failure (the API being down) is also treated as "no session": the
 * storefront stays browsable, which is the right call for a shop.
 */
export async function getCurrentUserSafe(options?: RequestOptions): Promise<AuthUser | null> {
  try {
    return await getCurrentUser(options);
  } catch {
    return null;
  }
}

/**
 * Asks the API to re-read this user from Clerk and returns the account.
 *
 * Called right after a sign-in and whenever Clerk reports the user changed, so
 * a name or address edited in Clerk's profile is on screen immediately.
 * Null on any failure: the session is still real, and the next sync catches up.
 */
export async function syncCurrentUser(): Promise<AuthUser | null> {
  try {
    return await send<AuthUser>('post', '/api/auth/sync');
  } catch {
    return null;
  }
}
