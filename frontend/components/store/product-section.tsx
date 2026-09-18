import { Container } from '@/components/layout/container';
import { SectionHeading } from '@/components/layout/section-heading';
import { ProductGrid, type GridColumns } from '@/components/product/product-grid';
import type { Product } from '@/types/product';
import { cn } from '@/lib/utils';

interface ProductSectionProps {
  eyebrow?: string;
  title: string;
  description?: string;
  products: Product[];
  action?: { label: string; href: string };
  columns?: GridColumns;
  priorityCount?: number;
  className?: string;
  id?: string;
}

/** Wraps a heading and a grid — used for Trending, New Arrivals and Best Sellers. */
export function ProductSection({
  eyebrow,
  title,
  description,
  products,
  action,
  columns = 4,
  priorityCount = 0,
  className,
  id,
}: ProductSectionProps) {
  return (
    <section id={id} className={cn('section-tight scroll-mt-24', className)}>
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
          action={action}
        />
        <ProductGrid
          products={products}
          columns={columns}
          priorityCount={priorityCount}
          className="mt-9"
        />
      </Container>
    </section>
  );
}
