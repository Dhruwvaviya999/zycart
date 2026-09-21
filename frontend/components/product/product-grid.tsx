import { ProductCard } from '@/components/product/product-card';
import type { ProductSummary } from '@/types/product';
import { cn } from '@/lib/utils';

/** Desktop column count. Mobile is always 2 and tablet always 3. */
export type GridColumns = 3 | 4 | 5;

const columnClasses: Record<GridColumns, string> = {
  3: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
};

const sizeHints: Record<GridColumns, string> = {
  3: '(min-width: 1024px) 31vw, (min-width: 640px) 31vw, 46vw',
  4: '(min-width: 1024px) 23vw, (min-width: 640px) 31vw, 46vw',
  5: '(min-width: 1280px) 18vw, (min-width: 1024px) 23vw, (min-width: 640px) 31vw, 46vw',
};

interface ProductGridProps {
  products: ProductSummary[];
  columns?: GridColumns;
  /** Number of leading cards to mark as priority for LCP. */
  priorityCount?: number;
  /** Per-card actions that replace the hover quick-add (used by the wishlist). */
  renderFooter?: (product: ProductSummary) => React.ReactNode;
  /** Heading level for each card, so the grid fits its page outline. */
  cardHeading?: 'h2' | 'h3';
  className?: string;
}

export function ProductGrid({
  products,
  columns = 4,
  priorityCount = 0,
  renderFooter,
  cardHeading,
  className,
}: ProductGridProps) {
  return (
    <div
      className={cn(
        'grid gap-x-4 gap-y-8 sm:gap-x-5 sm:gap-y-10',
        columnClasses[columns],
        className,
      )}
    >
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          sizes={sizeHints[columns]}
          priority={index < priorityCount}
          footer={renderFooter?.(product)}
          as={cardHeading}
        />
      ))}
    </div>
  );
}
