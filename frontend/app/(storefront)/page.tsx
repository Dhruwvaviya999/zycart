import { AlertTriangle } from 'lucide-react';
import { AiShopping } from '@/components/store/ai-shopping';
import { CategorySection } from '@/components/store/category-section';
import { Hero } from '@/components/store/hero';
import { Newsletter } from '@/components/store/newsletter';
import { ProductSection } from '@/components/store/product-section';
import { PromoBanner } from '@/components/store/promo-banner';
import { Container } from '@/components/layout/container';
import { getCategories } from '@/services/category.service';
import {
  getBestSellingProducts,
  getFeaturedProducts,
  getNewArrivals,
} from '@/services/product.service';
import { promoBanner, secondaryPromo } from '@/data/banners';
import type { Category, ProductSummary } from '@/types/product';

/**
 * Read from MongoDB on every request: nothing is prerendered at build time,
 * so `next build` never needs a running API.
 */
export const dynamic = 'force-dynamic';

/** An empty rail is simply not rendered, so the page never shows a bare heading. */
function settled<T>(result: PromiseSettledResult<T[]>): T[] {
  return result.status === 'fulfilled' ? result.value : [];
}

export default async function Home() {
  const [featuredResult, bestSellersResult, newArrivalsResult, categoriesResult] =
    await Promise.allSettled([
      getFeaturedProducts(8),
      getBestSellingProducts(8),
      getNewArrivals(8),
      getCategories(),
    ]);

  const featured: ProductSummary[] = settled(featuredResult);
  const bestSellers: ProductSummary[] = settled(bestSellersResult);
  const newArrivals: ProductSummary[] = settled(newArrivalsResult);
  const categories: Category[] = settled(categoriesResult);

  // One rail failing hides that rail; the catalogue being unreachable altogether
  // is worth telling the reader about, rather than showing a page of blanks.
  const catalogueDown =
    featured.length === 0 && bestSellers.length === 0 && newArrivals.length === 0;

  return (
    <>
      <Hero />

      <CategorySection categories={categories} />

      {catalogueDown ? (
        <section className="section-tight">
          <Container>
            <div
              role="alert"
              className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border bg-surface/60 px-6 py-14 text-center"
            >
              <AlertTriangle className="size-6 text-muted-foreground" aria-hidden />
              <h2 className="text-h3">The catalogue is unavailable right now.</h2>
              <p className="text-body max-w-md text-pretty text-muted-foreground">
                We could not load products from the store. Everything else still works — try
                refreshing in a moment.
              </p>
            </div>
          </Container>
        </section>
      ) : (
        <>
          {featured.length > 0 && (
            <ProductSection
              eyebrow="Right now"
              title="Trending Now"
              description="Discover what's popular right now."
              products={featured}
              action={{ label: 'View all', href: '/shop?sort=rating' }}
            />
          )}

          <PromoBanner banner={promoBanner} />

          {newArrivals.length > 0 && (
            <ProductSection
              eyebrow="Just landed"
              title="New Arrivals"
              description="Fresh products, just added."
              products={newArrivals}
              action={{ label: 'View all', href: '/shop?sort=newest' }}
            />
          )}

          <AiShopping />

          {bestSellers.length > 0 && (
            <ProductSection
              eyebrow="Proven"
              title="Best Sellers"
              description="Products customers keep coming back for."
              products={bestSellers}
              action={{ label: 'View all', href: '/shop' }}
            />
          )}

          <PromoBanner banner={secondaryPromo} reverse />
        </>
      )}

      <Newsletter />
    </>
  );
}
