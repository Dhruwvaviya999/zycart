import type { Request, Response } from 'express';
import {
  getProductPageRecommendations,
  getRecommendations,
} from '../services/recommendation/recommendation.service';
import { findSimilarProducts } from '../services/recommendation/similarity';
import { idOrSlugParamSchema } from '../validators/common';
import {
  recommendationQuerySchema,
  similarQuerySchema,
} from '../validators/recommendation.validator';

/** Comma-separated ids, with anything that is not an id quietly dropped. */
function parseExclude(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => /^[0-9a-fA-F]{24}$/.test(entry))
    .slice(0, 24);
}

/**
 * Products similar to one product. Public, deterministic, no model call.
 *
 * Nothing about the caller changes the answer, which is the point: a product
 * page's "similar products" is a fact about the catalogue, not about whoever is
 * reading it.
 */
export async function getSimilar(req: Request, res: Response): Promise<void> {
  const { idOrSlug } = idOrSlugParamSchema.parse(req.params);
  const { limit } = similarQuerySchema.parse(req.query);

  res.json({ success: true, data: await findSimilarProducts(idOrSlug, { limit }) });
}

/**
 * Recommendations for whoever is asking.
 *
 * `optionalAuth` has run, so `req.user` is either a verified customer or
 * absent. A guest gets popular products and is told `personalized: false`,
 * which is what keeps the storefront's heading honest.
 */
export async function getForCustomer(req: Request, res: Response): Promise<void> {
  const query = recommendationQuerySchema.parse(req.query);
  const exclude = parseExclude(query.exclude);

  const result =
    query.context === 'product' && query.productId
      ? await getProductPageRecommendations(query.productId, query.limit, exclude)
      : await getRecommendations({
          userId: req.user?.id ?? null,
          limit: query.limit,
          exclude,
        });

  res.json({ success: true, data: result });
}
