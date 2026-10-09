import { getRecommendations } from '@/services/recommendation.service';
import { RecommendationSection } from '@/components/recommendations/recommendation-section';
import { getSessionToken } from '@/lib/server-auth';
import type { RecommendationContext } from '@/types/recommendation';

/**
 * A recommendation rail that fetches its own data.
 *
 * An async server component so the page above it can stream: the homepage's
 * products and categories render immediately, and this rail arrives when its
 * query finishes rather than holding the page back. Wrap it in `<Suspense>` and
 * the main content never waits on a recommendation.
 *
 * The session token is passed explicitly — a server component has no browser
 * to attach it — which is what lets the server decide whether this customer
 * has anything personal to be recommended.
 */
interface RecommendedProductsProps {
  context?: RecommendationContext;
  limit?: number;
  exclude?: string[];
  productId?: string;
  title?: string;
  description?: string;
  action?: { label: string; href: string };
  contained?: boolean;
  columns?: 3 | 4 | 5;
  className?: string;
}

export async function RecommendedProducts({
  context = 'homepage',
  limit = 8,
  exclude,
  productId,
  ...presentation
}: RecommendedProductsProps) {
  const token = await getSessionToken();

  const { products, reason } = await getRecommendations(
    {
      context,
      limit,
      ...(exclude?.length ? { exclude } : {}),
      ...(productId ? { productId } : {}),
    },
    token ? { token } : undefined,
  );

  return <RecommendationSection products={products} reason={reason} {...presentation} />;
}
