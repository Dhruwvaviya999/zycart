import { cookies } from 'next/headers';
import { cache } from 'react';
import { getCurrentUserSafe } from '@/services/auth.service';
import type { AuthUser } from '@/types/user';

/**
 * Reads the session on the server.
 *
 * The session cookie belongs to the API's origin, so a server component has to
 * forward the browser's cookie header explicitly — nothing attaches it
 * automatically the way it would in the browser. This is the only module that
 * touches `next/headers`, which keeps the services layer usable from both sides.
 *
 * Wrapped in `cache` so the layout and the page it renders share one request:
 * Next dedupes `fetch` automatically, but this goes through Axios and would
 * otherwise hit the API once per caller.
 */
/** The raw cookie header, for server components calling the API directly. */
export const getSessionCookie = cache(async (): Promise<string> => (await cookies()).toString());

export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;

  return getCurrentUserSafe({ cookie });
});
