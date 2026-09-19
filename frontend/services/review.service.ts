import { request, requestList, send, sendMessage, type RequestOptions } from '@/services/api';
import type {
  MyReview,
  MyReviewListResponse,
  OwnReview,
  Review,
  ReviewDraft,
  ReviewEligibility,
  ReviewListResponse,
  ReviewQuery,
  ReviewSummary,
} from '@/types/review';

/**
 * Every call the storefront makes about reviews.
 *
 * Note what none of them send: a user id, a verification flag or a status.
 * Whether a review counts as a verified purchase, and whether it is public, are
 * decided by the server from the customer's order history.
 */

/** Public. Readable signed out, which is the point of publishing reviews at all. */
export async function getProductReviews(
  productId: string,
  query: ReviewQuery = {},
  options?: RequestOptions,
): Promise<ReviewListResponse> {
  const params: Record<string, string | number> = {};

  if (query.page !== undefined) params.page = query.page;
  if (query.limit !== undefined) params.limit = query.limit;
  if (query.rating !== undefined) params.rating = query.rating;
  if (query.sort) params.sort = query.sort;
  if (query.verified) params.verified = 'true';

  const { items, pagination } = await requestList<Review>(
    `/api/products/${encodeURIComponent(productId)}/reviews`,
    params,
    options,
  );

  return { items, pagination };
}

/**
 * Public rating summary.
 *
 * The product detail endpoint already carries the average, the count and the
 * distribution, so the product page does not call this — it is here for any
 * surface that has a product id but not the product.
 */
export function getProductReviewSummary(
  productId: string,
  options?: RequestOptions,
): Promise<ReviewSummary> {
  return request<ReviewSummary>(
    `/api/products/${encodeURIComponent(productId)}/reviews/summary`,
    undefined,
    options,
  );
}

/**
 * Whether the signed-in customer may review this product.
 *
 * Requires a session; a signed-out visitor is told so by the caller rather than
 * by an error, since not being signed in is not a failure.
 */
export function getReviewEligibility(
  productId: string,
  options?: RequestOptions,
): Promise<ReviewEligibility> {
  return request<ReviewEligibility>(
    `/api/reviews/eligibility/${encodeURIComponent(productId)}`,
    undefined,
    options,
  );
}

export function createReview(productId: string, draft: ReviewDraft): Promise<OwnReview> {
  return send<OwnReview>('post', '/api/reviews', { productId, ...draft });
}

export function updateReview(reviewId: string, draft: Partial<ReviewDraft>): Promise<OwnReview> {
  return send<OwnReview>('patch', `/api/reviews/${encodeURIComponent(reviewId)}`, draft);
}

export function deleteReview(reviewId: string): Promise<string> {
  return sendMessage('delete', `/api/reviews/${encodeURIComponent(reviewId)}`);
}

export async function getMyReviews(
  params: { page?: number; limit?: number } = {},
  options?: RequestOptions,
): Promise<MyReviewListResponse> {
  const query: Record<string, string | number> = {};
  if (params.page !== undefined) query.page = params.page;
  if (params.limit !== undefined) query.limit = params.limit;

  const { items, pagination } = await requestList<MyReview>('/api/reviews/me', query, options);

  return { items, pagination };
}
