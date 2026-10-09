import { auth } from '@clerk/nextjs/server';
import { cache } from 'react';
import { getCurrentUserSafe } from '@/services/auth.service';
import type { AuthUser } from '@/types/user';

/**
 * Reads the session on the server.
 *
 * Clerk says who is signed in; the API says whether that person has a ZyCart
 * account they may use. A server component calling the API has no browser to
 * attach a session for it, so it sends Clerk's session token as a `Bearer`
 * header — the token `proxy.ts` has just made sure is fresh. This is the only
 * module that touches `@clerk/nextjs/server`, which keeps the services layer
 * usable from both sides.
 *
 * Wrapped in `cache` so the layout and the page it renders share one request:
 * Next dedupes `fetch` automatically, but this goes through Axios and would
 * otherwise hit the API once per caller.
 */

/** The session token, for server components calling the API directly. Empty when signed out. */
export const getSessionToken = cache(async (): Promise<string> => {
  const { getToken } = await auth();
  return (await getToken()) ?? '';
});

/** Whether Clerk knows this visitor — which is not yet whether ZyCart lets them in. */
export const getClerkUserId = cache(async (): Promise<string | null> => (await auth()).userId);

export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  const token = await getSessionToken();
  if (!token) return null;

  return getCurrentUserSafe({ token });
});
