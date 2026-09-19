import { getSimilarProducts } from '@/services/recommendation.service';
import { RecommendationSection } from '@/components/recommendations/recommendation-section';

/**
 * "Similar products" on a product page.
 *
 * Deterministic server-side scoring, no model call — a shopper looking at a
 * trail shoe gets the other trail shoes, ranked by how much they actually have
 * in common, and gets the same list every time they come back to the page.
 *
 * Streams independently, so the product itself never waits on it.
 */
export async function SimilarProducts({
  slug,
  limit = 4,
  title,
  description,
}: {
  slug: string;
  limit?: number;
  title?: string;
  description?: string;
}) {
  const products = await getSimilarProducts(slug, limit);

  return (
    <RecommendationSection
      products={products}
      reason="similar"
      {...(title ? { title } : {})}
      {...(description ? { description } : {})}
    />
  );
}
