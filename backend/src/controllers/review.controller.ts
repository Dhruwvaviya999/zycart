import type { Request, Response } from 'express';
import * as reviewService from '../services/review.service';
import { AppError } from '../utils/AppError';
import { AUTH_COOKIE } from '../utils/cookies';
import { verifyToken } from '../utils/jwt';
import {
  createReviewSchema,
  myReviewQuerySchema,
  productIdParamSchema,
  reviewIdParamSchema,
  reviewQuerySchema,
  updateReviewSchema,
} from '../validators/review.validator';

function currentUserId(req: Request): string {
  if (!req.user) throw new AppError('Not authenticated', 401);
  return req.user.id;
}

/**
 * The viewer's id on a public route, or undefined.
 *
 * The review list is readable by anyone, so it cannot sit behind `requireAuth`.
 * But a signed-in customer browsing it should see the edit controls on their
 * own review, which means knowing who they are without requiring it. Any
 * failure here is silent and simply yields an anonymous viewer — this decides
 * whether a button renders, never what anybody is allowed to do.
 */
function optionalViewerId(req: Request): string | undefined {
  const token: unknown = req.cookies?.[AUTH_COOKIE];
  if (typeof token !== 'string' || token.length === 0) return undefined;

  try {
    return verifyToken(token, req.env.JWT_SECRET).sub;
  } catch {
    return undefined;
  }
}

const productId = (req: Request): string =>
  productIdParamSchema.parse({ productId: req.params.productId }).productId;

const reviewId = (req: Request): string =>
  reviewIdParamSchema.parse({ reviewId: req.params.reviewId }).reviewId;

/* ---------------------------------------------------------------- */
/* Public                                                            */
/* ---------------------------------------------------------------- */

export async function listProductReviews(req: Request, res: Response): Promise<void> {
  const query = reviewQuerySchema.parse(req.query);

  const { items, pagination } = await reviewService.listProductReviews(
    productId(req),
    query,
    optionalViewerId(req),
  );

  res.json({ success: true, data: items, pagination });
}

export async function getProductReviewSummary(req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: await reviewService.getProductReviewSummary(productId(req)),
  });
}

/* ---------------------------------------------------------------- */
/* Authenticated                                                     */
/* ---------------------------------------------------------------- */

export async function getEligibility(req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: await reviewService.getEligibility(currentUserId(req), productId(req)),
  });
}

export async function createReview(req: Request, res: Response): Promise<void> {
  const input = createReviewSchema.parse(req.body);

  res.status(201).json({
    success: true,
    data: await reviewService.createReview(currentUserId(req), input),
  });
}

export async function updateReview(req: Request, res: Response): Promise<void> {
  const input = updateReviewSchema.parse(req.body);

  res.json({
    success: true,
    data: await reviewService.updateReview(currentUserId(req), reviewId(req), input),
  });
}

export async function deleteReview(req: Request, res: Response): Promise<void> {
  await reviewService.deleteReview(currentUserId(req), reviewId(req));

  res.json({ success: true, message: 'Review deleted' });
}

export async function listMyReviews(req: Request, res: Response): Promise<void> {
  const query = myReviewQuerySchema.parse(req.query);

  const { items, pagination } = await reviewService.listMyReviews(currentUserId(req), query);

  res.json({ success: true, data: items, pagination });
}
