import { request } from '@/services/api';
import type { RecommendationContext, RecommendationResponse } from '@/types/recommendation';
import type { ProductSummary } from '@/types/product';

/**
 * Recommendations and similar products.
 *
 * Neither endpoint involves a model: similarity and ranking are deterministic
 * server-side code. Both are safe to call from a server component, and both
 * fail soft — a rail that cannot load is a rail that does not render, never a
 * page that breaks.
 */

const EMPTY: RecommendationResponse = { products: [], personalized: false, reason: 'popular' };

export interface RecommendationParams {
  context?: RecommendationContext;
  limit?: number;
  /** Products already on the page, so a rail does not repeat them. */
  exclude?: string[];
  /** The product being viewed, for `context: 'product'`. */
  productId?: string;
}

export async function getRecommendations(
  params: RecommendationParams = {},
  options?: { token?: string },
): Promise<RecommendationResponse> {
  const query: Record<string, string | number> = {};

  if (params.context) query.context = params.context;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.productId) query.productId = params.productId;
  if (params.exclude?.length) query.exclude = params.exclude.join(',');

  try {
    return await request<RecommendationResponse>('/api/recommendations', query, options);
  } catch {
    // A secondary rail must never take a page down with it.
    return EMPTY;
  }
}

export async function getSimilarProducts(slug: string, limit = 4): Promise<ProductSummary[]> {
  try {
    return await request<ProductSummary[]>(`/api/products/${encodeURIComponent(slug)}/similar`, {
      limit,
    });
  } catch {
    return [];
  }
}
