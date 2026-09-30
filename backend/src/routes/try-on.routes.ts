import express, { Router } from 'express';
import * as controller from '../controllers/try-on.controller';
import { optionalAuth, requireAuth } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { MAX_TRY_ON_PHOTO_BYTES } from '../services/try-on/try-on.service';
import { asyncHandler } from '../utils/asyncHandler';

export const tryOnRouter = Router();

tryOnRouter.get('/try-on/status', asyncHandler(optionalAuth), asyncHandler(controller.getStatus));

/**
 * One try-on (Phase 19).
 *
 * Signed-in customers only: every try is a paid image generation, and an
 * account is what the daily allowance is counted against. The order of the
 * middleware is the point — the session is checked before a byte of the photo
 * is read, and the photo parser is mounted on this route alone, with its own
 * ceiling, so nowhere else in the API accepts a multi-megabyte body.
 *
 * The burst limit is separate from the daily allowance. The allowance caps
 * what an account can spend in a day; this stops one tab firing ten requests
 * in a second, each of which would hold a slot of that allowance while it ran.
 */
tryOnRouter.post(
  '/try-on/:productRef',
  asyncHandler(requireAuth),
  rateLimit({
    windowMs: 60_000,
    max: 4,
    keyBy: (req) => `try-on:${req.user?.id ?? req.ip ?? 'unknown'}`,
    message: 'One moment — the last preview is still being made.',
  }),
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_TRY_ON_PHOTO_BYTES }),
  asyncHandler(controller.create),
);
