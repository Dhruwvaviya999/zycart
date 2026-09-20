import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/user.model';
import { AppError } from '../utils/AppError';
import { AUTH_COOKIE } from '../utils/cookies';
import { verifyToken } from '../utils/jwt';

/**
 * Verifies the auth cookie and attaches the identity, or leaves the request
 * anonymous.
 *
 * The user is loaded on every protected request — one indexed lookup by `_id` —
 * rather than trusted from the token, so deactivating an account takes effect
 * immediately instead of whenever the token happens to expire. Only what an
 * authorisation decision needs is selected, plus the name, which the audit log
 * writes so that an administrative action is attributable to a person rather
 * than to an object id.
 *
 * Returns rather than throws, because the two callers below disagree about
 * what an absent session means: for a guarded route it is a 401, and for the
 * AI assistant it is simply a shopper who has not signed in.
 */
async function identify(req: Request): Promise<boolean> {
  const token: unknown = req.cookies?.[AUTH_COOKIE];

  if (typeof token !== 'string' || token.length === 0) return false;

  const { sub, issuedAt } = verifyToken(token, req.env.JWT_SECRET);
  const user = await User.findById(sub).select(
    'firstName lastName email role isActive passwordChangedAt',
  );

  if (!user || !user.isActive) return false;

  // Issued before the password last changed, so it belongs to a session that
  // change was meant to end.
  if (user.passwordChangedAt && issuedAt * 1000 < user.passwordChangedAt.getTime()) {
    return false;
  }

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
 * assistant is the first — so that "more" is decided by a verified cookie
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
    // Unreadable cookie: browse as a guest.
  }

  next();
}
