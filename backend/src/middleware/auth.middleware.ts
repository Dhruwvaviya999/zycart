import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/user.model';
import { AppError } from '../utils/AppError';
import { AUTH_COOKIE } from '../utils/cookies';
import { verifyToken } from '../utils/jwt';

/**
 * Reads the auth cookie, verifies it, and attaches the identity to the request.
 *
 * The user is loaded on every protected request — one indexed lookup by `_id` —
 * rather than trusted from the token, so deactivating an account takes effect
 * immediately instead of whenever the token happens to expire. Only the three
 * fields an authorisation decision needs are selected.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token: unknown = req.cookies?.[AUTH_COOKIE];

    if (typeof token !== 'string' || token.length === 0) {
      throw new AppError('Not authenticated', 401);
    }

    const { sub, issuedAt } = verifyToken(token, req.env.JWT_SECRET);
    const user = await User.findById(sub).select('email role isActive passwordChangedAt');

    if (!user || !user.isActive) {
      throw new AppError('Not authenticated', 401);
    }

    // Issued before the password last changed, so it belongs to a session that
    // change was meant to end.
    if (user.passwordChangedAt && issuedAt * 1000 < user.passwordChangedAt.getTime()) {
      throw new AppError('Not authenticated', 401);
    }

    req.user = { id: String(user._id), email: user.email, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
}
