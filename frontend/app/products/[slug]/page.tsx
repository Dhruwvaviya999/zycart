import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { Container } from '@/components/layout/container';
import { SectionHeading } from '@/components/layout/section-heading';
import { ProductGallery } from '@/components/product/product-gallery';
import { ProductGrid } from '@/components/product/product-grid';
import { ProductPurchasePanel } from '@/components/product/product-purchase-panel';
import { Rating } from '@/components/product/rating';
import { categoryName } from '@/data/categories';
import { alsoLike, productBySlug, products, relatedProducts, reviews } from '@/data/products';
import { formatDate } from '@/lib/format';

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const product = productBySlug(slug);
  if (!product) return { title: 'Product not found' };

  return {
    title: `${product.brand} ${product.name}`,
    description: product.tagline,
  };
}

export default async function ProductPage({ params }: PageProps<'/products/[slug]'>) {
  const { slug } = await params;
  const product = productBySlug(slug);

  if (!product) notFound();

  const related = relatedProducts(product);
  const suggestions = alsoLike(product);

  return (
    <>
      <Container className="py-8 sm:py-10">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Shop', href: '/shop' },
            { label: categoryName(product.category), href: `/shop?category=${product.category}` },
            { label: product.name },
          ]}
        />

        <div className="mt-7 grid gap-10 lg:grid-cols-2 lg:gap-14">
          <ProductGallery product={product} />
          <ProductPurchasePanel product={product} />
        </div>

        <section className="mt-16 lg:mt-20">
          <Tabs defaultValue="description">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="description">Description</TabsTrigger>
              <TabsTrigger value="specifications">Specifications</TabsTrigger>
              <TabsTrigger value="reviews">Reviews ({reviews.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="description" className="pt-8">
              <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <p className="text-body-lg max-w-2xl text-pretty text-muted-foreground">
                  {product.description}
                </p>

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
              </div>
            </TabsContent>

            <TabsContent value="specifications" className="pt-8">
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
            </TabsContent>

            <TabsContent value="reviews" className="pt-8">
              <div className="grid gap-10 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
                <div className="rounded-2xl border border-border bg-surface p-6">
                  <p className="text-price-lg">{product.rating.toFixed(1)}</p>
                  <Rating value={product.rating} showStars size="md" className="mt-2" />
                  <p className="text-caption mt-3 text-muted-foreground">
                    Based on {product.reviewCount.toLocaleString('en-IN')} verified reviews
                  </p>
                </div>

                <ul className="space-y-6">
                  {reviews.map((review) => (
                    <li key={review.id} className="border-b border-border pb-6 last:border-0">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          <AvatarFallback className="text-caption">
                            {review.initials}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0">
                          <p className="text-small font-medium">
                            {review.author}
                            {review.verified && (
                              <span className="text-caption ml-2 rounded-full bg-success/12 px-2 py-0.5 font-medium text-success">
                                Verified
                              </span>
                            )}
                          </p>
                          <p className="text-caption text-muted-foreground">
                            {formatDate(review.date)}
                          </p>
                        </div>

                        <Rating value={review.rating} showStars className="ml-auto shrink-0" />
                      </div>

                      <h3 className="text-small mt-4 font-semibold">{review.title}</h3>
                      <p className="text-small mt-1.5 text-pretty text-muted-foreground">
                        {review.body}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </Container>

      {related.length > 0 && (
        <section className="section-tight">
          <Container>
            <SectionHeading
              title="Related products"
              description={`More from ${categoryName(product.category)}.`}
              action={{ label: 'View category', href: `/shop?category=${product.category}` }}
            />
            <ProductGrid products={related} columns={4} className="mt-9" />
          </Container>
        </section>
      )}

      <section className="section-tight">
        <Container>
          <SectionHeading
            title="You may also like"
            description="Highly rated pieces from across the catalogue."
            action={{ label: 'Browse everything', href: '/shop' }}
          />
          <ProductGrid products={suggestions} columns={4} className="mt-9" />
        </Container>
      </section>
    </>
  );
}
