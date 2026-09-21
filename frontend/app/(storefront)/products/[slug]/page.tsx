import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { Container } from '@/components/layout/container';
import { SectionHeading } from '@/components/layout/section-heading';
import { ProductGallery } from '@/components/product/product-gallery';
import { ProductGrid } from '@/components/product/product-grid';
import { ProductGridSkeleton } from '@/components/common/loading-state';
import { ProductPurchasePanel } from '@/components/product/product-purchase-panel';
import { ProductTabs } from '@/components/product/product-tabs';
import { ProductReviews } from '@/components/reviews/product-reviews';
import { ProductViewTracker } from '@/components/recommendations/product-view-tracker';
import { SimilarProducts } from '@/components/recommendations/similar-products';
import { ApiError } from '@/services/api';
import { getProductBySlug, getRelatedProducts } from '@/services/product.service';
import type { Product, ProductReference } from '@/types/product';

/** A missing product is a 404; anything else is a real failure worth surfacing. */
async function loadProduct(slug: string): Promise<Product> {
  try {
    return await getProductBySlug(slug);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const { slug } = await params;

  const product = await loadProduct(slug);
  return {
    title: `${product.brand.name} ${product.name}`,
    description: product.shortDescription,
  };
}

export default async function ProductPage({ params }: PageProps<'/products/[slug]'>) {
  const { slug } = await params;
  const product = await loadProduct(slug);

  return (
    <>
      {/* Records the visit after paint; never blocks the page. */}
      <ProductViewTracker slug={slug} />

      <Container className="py-8 sm:py-10">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Shop', href: '/shop' },
            { label: product.category.name, href: `/shop?category=${product.category.slug}` },
            { label: product.name },
          ]}
        />

        <div className="mt-7 grid gap-10 lg:grid-cols-2 lg:gap-14">
          <ProductGallery product={product} />
          <ProductPurchasePanel product={product} />
        </div>

        <section className="mt-16 lg:mt-20">
          <ProductTabs
            reviewCount={product.reviewCount}
            description={
              <>
                <h2 className="sr-only">Description</h2>
                <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <p className="text-body-lg max-w-2xl text-pretty text-muted-foreground">
                    {product.description}
                  </p>

                  {product.highlights.length > 0 && (
                    <div>
                      <h3 className="text-h4">Highlights</h3>
                      <ul className="mt-4 space-y-3">
                        {product.highlights.map((highlight) => (
                          <li key={highlight} className="text-small flex gap-3">
                            <span
                              className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-brand"
                              aria-hidden
                            />
                            {highlight}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </>
            }
            specifications={
              product.specifications.length > 0 ? (
                <>
                  <h2 className="sr-only">Specifications</h2>
                  <dl className="max-w-2xl divide-y divide-border rounded-2xl border border-border">
                    {product.specifications.map((spec) => (
                      <div
                        key={spec.label}
                        className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-4 px-5 py-4"
                      >
                        <dt className="text-small text-muted-foreground">{spec.label}</dt>
                        <dd className="text-small font-medium">{spec.value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : null
            }
            reviews={
              <>
                <h2 className="sr-only">Customer reviews</h2>

                {/* The summary comes from the product the page already loaded,
                    so opening this tab costs one request for the reviews
                    themselves rather than two. */}
                <ProductReviews
                  productId={product.id}
                  productName={product.name}
                  initialSummary={{
                    averageRating: product.rating,
                    reviewCount: product.reviewCount,
                    distribution: product.ratingBreakdown,
                  }}
                />
              </>
            }
          />
        </section>
      </Container>

      {/*
        Two rails answering two different questions, each streaming on its own
        so neither can hold up the product.

        "Similar products" is Phase 11's deterministic scorer: same category,
        brand, tags, price band and variants, weighted and ranked. "More from
        this category" is Phase 3's simpler rail and stays as it was — there is
        no point replacing a rail that already answers its own question well.
      */}
      <Suspense fallback={<RailSkeleton />}>
        <SimilarProducts slug={slug} limit={4} />
      </Suspense>

      <Suspense fallback={<RailSkeleton />}>
        <RelatedRail slug={slug} category={product.category} />
      </Suspense>
    </>
  );
}

/** Both rails are optional, so each streams in on its own and neither can fail the page. */
async function RelatedRail({ slug, category }: { slug: string; category: ProductReference }) {
  const related = await getRelatedProducts(slug, 4).catch(() => []);
  if (related.length === 0) return null;

  return (
    <section className="section-tight">
      <Container>
        <SectionHeading
          title="Related products"
          description={`More from ${category.name}.`}
          action={{ label: 'View category', href: `/shop?category=${category.slug}` }}
        />
        <ProductGrid products={related} columns={4} className="mt-9" />
      </Container>
    </section>
  );
}

function RailSkeleton() {
  return (
    <section className="section-tight">
      <Container>
        <ProductGridSkeleton count={4} />
      </Container>
    </section>
  );
}
