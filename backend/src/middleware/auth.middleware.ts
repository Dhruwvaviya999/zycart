import type { NextFunction, Request, Response } from 'express';
import { authenticateOptions, clerkFor } from '../config/clerk';
import { accountForSession } from '../services/auth/clerk-sync';
import { AppError } from '../utils/AppError';

/**
 * The parts of an Express request Clerk reads — the URL and the headers that
 * carry a session, `Authorization` and `Cookie` — as the Fetch API `Request`
 * its SDK takes. The body is deliberately left behind: no session lives there.
 */
function toFetchRequest(req: Request): globalThis.Request {
  const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host') ?? 'localhost'}`);
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }

  return new globalThis.Request(url, { method: 'GET', headers });
}

/**
 * Verifies the Clerk session and attaches the ZyCart identity, or leaves the
 * request anonymous.
 *
 * Clerk answers "which Clerk user is this?" — from a `Bearer` token, which the
 * storefront always sends once Clerk has loaded, or from Clerk's own session
 * cookie when it has not. A stale cookie that Clerk would refresh with a
 * redirect is simply no session here: an API has nobody to redirect.
 *
 * The account is then loaded on every protected request — one indexed lookup
 * by `clerkId` — rather than trusted from the token, so deactivating an
 * account takes effect immediately instead of whenever the token happens to
 * expire. Only what an authorisation decision needs is selected, plus the
 * name, which the audit log writes so that an administrative action is
 * attributable to a person rather than to an object id.
 *
 * Returns rather than throws, because the two callers below disagree about
 * what an absent session means: for a guarded route it is a 401, and for the
 * AI assistant it is simply a shopper who has not signed in.
 */
async function identify(req: Request): Promise<boolean> {
  const state = await clerkFor(req.env).authenticateRequest(
    toFetchRequest(req),
    authenticateOptions(req.env),
  );

  if (!state.isAuthenticated) return false;

  const { userId: clerkId } = state.toAuth();
  const user = await accountForSession(req.env, clerkId);

  if (!user || !user.isActive) return false;

  req.user = {
    id: String(user._id),
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
    role: user.role,
  };
  return true;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!(await identify(req))) throw new AppError('Not authenticated', 401);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Attaches the identity when there is one, and continues either way.
 *
 * For endpoints a guest may use but a customer gets more from — the AI
 * assistant is the first — so that "more" is decided by a verified session
 * rather than by the client claiming to be signed in.
 *
 * A malformed or expired token is treated as no session at all rather than as
 * an error: the shopper is browsing, and being signed out is not a failure. It
 * grants nothing on its own; every capability behind it still checks `req.user`
 * for itself.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await identify(req);
  } catch {
    // Unverifiable session: browse as a guest.
  }

  next();
}
