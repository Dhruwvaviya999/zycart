import { Router, type Request } from 'express';
import * as controller from '../controllers/search.controller';
import { optionalAuth } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const searchRouter = Router();

/**
 * Public: searching is not something a shopper should have to sign in for.
 *
 * `optionalAuth` runs only so the limiter can count a signed-in customer
 * against their account rather than against a shared address — the search
 * itself is identical either way and reads nothing personal.
 *
 * The allowances are looser than the assistant's because most searches never
 * reach a model at all: the classifier sends short, literal queries straight to
 * the catalogue. In-memory and single-instance, with the same documented
 * limitation as every other limiter here.
 */
searchRouter.post(
  '/search/smart',
  asyncHandler(optionalAuth),
  rateLimit({
    windowMs: 60_000,
    max: (req: Request) => (req.user ? 60 : 30),
    keyBy: (req: Request) =>
      req.user ? `search:user:${req.user.id}` : `search:ip:${req.ip ?? 'unknown'}`,
    message: 'Too many searches in a row. Please try again in a moment.',
  }),
  asyncHandler(controller.smartSearchQuery),
);
