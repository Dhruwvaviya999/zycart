import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env';
import { expiresInMs } from './jwt';

export const AUTH_COOKIE = 'zycart_token';

/**
 * One definition for both setting and clearing, because a cookie is only cleared
 * when every attribute matches the one that was set.
 *
 * `sameSite: 'lax'` is deliberate: the storefront and the API share a site in
 * both the local setup (localhost:3000 / localhost:5000 — ports do not make a
 * request cross-site) and a domain + subdomain deployment. A genuinely
 * cross-site API would need `sameSite: 'none'` with `secure: true`.
 */
function baseOptions(env: Env): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

export function setAuthCookie(res: Response, token: string, env: Env): void {
  res.cookie(AUTH_COOKIE, token, {
    ...baseOptions(env),
    maxAge: expiresInMs(env.JWT_EXPIRES_IN),
  });
}

export function clearAuthCookie(res: Response, env: Env): void {
  res.clearCookie(AUTH_COOKIE, baseOptions(env));
}
