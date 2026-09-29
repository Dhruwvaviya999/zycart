import { Router } from 'express';
import * as controller from '../controllers/newsletter.controller';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const newsletterRouter = Router();

/**
 * Public, and therefore bounded.
 *
 * Sign-up sends mail to an address the caller names, so it is limited per IP
 * here and per address by the cooldown in the service — between them, the form
 * cannot be turned into a way of filling somebody's inbox.
 */
const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many sign-up attempts. Please try again in a few minutes.',
});

const linkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Please try again in a few minutes.',
});

newsletterRouter.post(
  '/newsletter/subscribe',
  subscribeLimiter,
  asyncHandler(controller.subscribe),
);
newsletterRouter.post('/newsletter/confirm', linkLimiter, asyncHandler(controller.confirm));
newsletterRouter.post('/newsletter/unsubscribe', linkLimiter, asyncHandler(controller.unsubscribe));
