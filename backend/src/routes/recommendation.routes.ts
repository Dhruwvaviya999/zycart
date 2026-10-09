import { Router } from 'express';
import * as controller from '../controllers/recommendation.controller';
import { optionalAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const recommendationRouter = Router();

/**
 * Public, because a guest deserves useful suggestions too — they simply get the
 * catalogue's popular products rather than anything personal.
 *
 * `optionalAuth` is what decides which: the customer is read from the verified
 * session, never from a parameter, so there is no request that can ask
 * for somebody else's recommendations.
 *
 * Not rate limited beyond the app's normal handling: this is a bounded MongoDB
 * query with no model call behind it, in the same cost class as the product
 * list endpoints next to it.
 */
recommendationRouter.get(
  '/recommendations',
  asyncHandler(optionalAuth),
  asyncHandler(controller.getForCustomer),
);
