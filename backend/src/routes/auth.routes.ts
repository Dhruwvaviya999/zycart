import { Router } from 'express';
import * as controller from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const authRouter = Router();

/**
 * Credentials never reach this API: Clerk takes them, and throttles its own
 * sign-in and sign-up. What remains is reading the account and keeping it in
 * step with Clerk.
 */
authRouter.get('/auth/me', asyncHandler(requireAuth), asyncHandler(controller.me));

/**
 * Each call is a request to Clerk's API, so a stuck client is bounded per
 * account well below anything Clerk's own limits would notice.
 */
authRouter.post(
  '/auth/sync',
  asyncHandler(requireAuth),
  rateLimit({
    windowMs: 60_000,
    max: 20,
    keyBy: (req) => `auth-sync:${req.user?.id ?? req.ip ?? 'unknown'}`,
    message: 'Too many requests. Please try again in a moment.',
  }),
  asyncHandler(controller.sync),
);

/**
 * Public, like the Razorpay webhook: the signature is the authority, not a
 * session. The raw body it is verified against is arranged in `createApp`.
 */
authRouter.post('/webhooks/clerk', asyncHandler(controller.clerkWebhook));
