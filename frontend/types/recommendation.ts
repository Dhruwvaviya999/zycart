import type { ProductSummary } from '@/types/product';

/** Where a recommendation rail is being rendered. */
export type RecommendationContext = 'homepage' | 'product' | 'cart';

/**
 * Why these products, in the only terms the storefront is allowed to claim.
 *
 * `interests` is the one that permits a personalised heading — and the server
 * only returns it when the ranking genuinely used the customer's own activity.
 */
export type RecommendationReason = 'interests' | 'similar' | 'popular';

export interface RecommendationResponse {
  products: ProductSummary[];
  /** False for a guest, a new account, or anyone without enough signal. */
  personalized: boolean;
  reason: RecommendationReason;
}
