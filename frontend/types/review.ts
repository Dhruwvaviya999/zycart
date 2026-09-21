import type { Pagination } from '@/types/product';

/**
 * Moderation state.
 *
 * Only APPROVED reviews are ever returned by the public list, so this is
 * meaningful only on the customer's own reviews — where "pending" or "removed"
 * is something they are entitled to know about their own writing.
 */
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Whole stars only. The API rejects anything else. */
export type RatingValue = 1 | 2 | 3 | 4 | 5;

export const RATING_VALUES: RatingValue[] = [1, 2, 3, 4, 5];

export const MAX_REVIEW_IMAGES = 5;

/**
 * A reviewer as the storefront is allowed to see them.
 *
 * `name` arrives already shortened to "Ananya R." by the server. There is no
 * field here for an email or a full surname, because neither ever leaves the
 * API.
 */
export interface ReviewAuthor {
  name: string;
  avatar: string;
}

export interface Review {
  id: string;
  rating: RatingValue;
  title: string;
  comment: string;
  images: string[];
  /** Server-determined. The client cannot set or influence it. */
  isVerifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
  author: ReviewAuthor;
  /** Present only on the signed-in customer's own review. */
  isMine?: boolean;
}

/** The customer's own review, which carries its moderation state. */
export interface OwnReview extends Review {
  status: ReviewStatus;
  productId: string;
}

/** A row in "My reviews", which needs to name the product it is about. */
export interface MyReview extends OwnReview {
  product: { id: string; name: string; slug: string; image: string };
}

/** How many approved reviews gave each star. */
export type RatingDistribution = Record<'1' | '2' | '3' | '4' | '5', number>;

export interface ReviewSummary {
  averageRating: number;
  reviewCount: number;
  distribution: RatingDistribution;
}

/**
 * Why a customer cannot review a product.
 *
 * Each maps to a different thing worth saying — buy it, wait for it to arrive,
 * or edit what you already wrote — so the interface branches on this rather
 * than rendering a permission error.
 */
export type IneligibilityReason =
  | 'NOT_AUTHENTICATED'
  | 'NOT_PURCHASED'
  | 'ORDER_NOT_DELIVERED'
  | 'ALREADY_REVIEWED'
  | 'PRODUCT_UNAVAILABLE';

export interface ReviewEligibility {
  eligible: boolean;
  reason: IneligibilityReason | null;
  existingReview: OwnReview | null;
}

export type ReviewSort = 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating';

export interface ReviewQuery {
  page?: number;
  limit?: number;
  rating?: RatingValue;
  sort?: ReviewSort;
  verified?: boolean;
}

export interface ReviewListResponse {
  items: Review[];
  pagination: Pagination;
}

export interface MyReviewListResponse {
  items: MyReview[];
  pagination: Pagination;
}

/** What the review form submits. No status, no verification, no user. */
export interface ReviewDraft {
  rating: RatingValue;
  title: string;
  comment: string;
  images: string[];
}
