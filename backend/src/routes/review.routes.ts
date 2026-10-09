import { Router } from 'express';
import * as controller from '../controllers/review.controller';
import { optionalAuth, requireAuth } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const reviewRouter = Router();

/**
 * Reading reviews is public.
 *
 * Deliberately so: hiding what other customers said from anyone not signed in
 * would make the ratings unverifiable to exactly the people deciding whether to
 * buy. Writing is another matter, and everything below the guard requires a
 * session.
 */
reviewRouter.get(
  '/products/:productId/reviews',
  asyncHandler(optionalAuth),
  asyncHandler(controller.listProductReviews),
);
reviewRouter.get(
  '/products/:productId/reviews/summary',
  asyncHandler(controller.getProductReviewSummary),
);

// Everything below is the signed-in customer acting on their own reviews; there
// is no route that takes a user id.
reviewRouter.use('/reviews', asyncHandler(requireAuth));

reviewRouter.get('/reviews/me', asyncHandler(controller.listMyReviews));
reviewRouter.get('/reviews/eligibility/:productId', asyncHandler(controller.getEligibility));

/**
 * Writing is throttled, lightly.
 *
 * A customer can only review a product they had delivered, and only once, so
 * this is not the defence against review spam — the verified-purchase rule is.
 * It is here so that a stuck client cannot hammer the endpoint.
 */
reviewRouter.post(
  '/reviews',
  rateLimit({
    windowMs: 60_000,
    max: 10,
    message: 'You are posting reviews very quickly. Please wait a moment.',
  }),
  asyncHandler(controller.createReview),
);

reviewRouter.patch('/reviews/:reviewId', asyncHandler(controller.updateReview));
reviewRouter.delete('/reviews/:reviewId', asyncHandler(controller.deleteReview));
