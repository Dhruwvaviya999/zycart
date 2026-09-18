import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserRole } from '../models/user.model';
import { AppError } from '../utils/AppError';

/**
 * Authorisation, to be mounted after `requireAuth`. Being signed in but lacking
 * the role is a 403, not a 401: retrying with different credentials is the
 * answer to one and not the other.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Not authenticated', 401));
    if (!roles.includes(req.user.role)) return next(new AppError('Not allowed', 403));
    next();
  };
}
