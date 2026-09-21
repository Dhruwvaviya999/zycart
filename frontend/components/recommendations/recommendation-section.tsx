import { Container } from '@/components/layout/container';
import { ProductGrid } from '@/components/product/product-grid';
import { SectionHeading } from '@/components/layout/section-heading';
import type { RecommendationReason } from '@/types/recommendation';
import type { ProductSummary } from '@/types/product';
import { cn } from '@/lib/utils';

/**
 * One recommendation rail, with an honest heading.
 *
 * The heading is chosen from what the server actually did, never from where the
 * rail happens to be rendered. A list of popular products is called "Popular
 * right now" even on a signed-in customer's homepage, because calling it
 * "Recommended for you" would be a claim about data the server has just said it
 * does not have.
 *
 * That mapping lives here, in one table, so no page can label a rail for itself.
 */

interface Copy {
  eyebrow: string;
  title: string;
  description: string;
}

const COPY: Record<RecommendationReason, Copy> = {
  interests: {
    eyebrow: 'Picked for you',
    title: 'Recommended for you',
    description: 'Based on the products you have been looking at.',
  },
  similar: {
    eyebrow: 'More like this',
    title: 'Similar products',
    description: 'Close matches on category, brand, price and options.',
  },
  popular: {
    eyebrow: 'Right now',
    title: 'Popular right now',
    description: 'What other customers are buying and rating highly.',
  },
};

interface RecommendationSectionProps {
  products: ProductSummary[];
  reason: RecommendationReason;
  /** Overrides the mapped title where a page has a better-fitting one. */
  title?: string;
  description?: string;
  action?: { label: string; href: string };
  /** `false` renders without the outer `Container`, for pages that own their gutter. */
  contained?: boolean;
  columns?: 3 | 4 | 5;
  className?: string;
}

export function RecommendationSection({
  products,
  reason,
  title,
  description,
  action,
  contained = true,
  columns = 4,
  className,
}: RecommendationSectionProps) {
  // An empty rail is not rendered at all, so a page never shows a bare heading
  // over nothing — the same rule the homepage's other rails follow.
  if (products.length === 0) return null;

  const copy = COPY[reason];

  const body = (
    <>
      <SectionHeading
        eyebrow={copy.eyebrow}
        title={title ?? copy.title}
        description={description ?? copy.description}
        {...(action ? { action } : {})}
      />
      <ProductGrid products={products} columns={columns} className="mt-9" />
    </>
  );

  return (
    <section className={cn('section-tight', className)}>
      {contained ? <Container>{body}</Container> : body}
    </section>
  );
}
