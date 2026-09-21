import type { RequestHandler } from 'express';
import { requireAuth } from './auth.middleware';
import { requireRole } from './role.middleware';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Signed in, and an administrator.
 *
 * The two guards always travel together, so they are bound together once here
 * rather than re-paired at each route — which is how one of them eventually
 * goes missing. Spread into a route definition:
 *
 * ```ts
 * router.post('/products', ...adminOnly, asyncHandler(controller.createProduct));
 * ```
 *
 * Order matters and is fixed by this array: no session is a 401, because
 * retrying with credentials might help; a signed-in customer is a 403, because
 * it would not.
 */
export const adminOnly: RequestHandler[] = [asyncHandler(requireAuth), requireRole('ADMIN')];
