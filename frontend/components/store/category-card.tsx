import Image from 'next/image';
import Link from 'next/link';
import type { Category } from '@/types/product';
import { cn } from '@/lib/utils';

interface CategoryCardProps {
  category: Category;
  /** Width hint for the image loader; set it when the grid is not six-up. */
  sizes?: string;
  className?: string;
}

/** Compact browsing tile — deliberately smaller than a product card. */
export function CategoryCard({
  category,
  sizes = '(min-width: 1024px) 16vw, 46vw',
  className,
}: CategoryCardProps) {
  return (
    <Link
      href={`/shop?category=${category.slug}`}
      className={cn(
        'focus-ring group relative flex flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-border/70 transition-shadow duration-300 ease-brand hover:shadow-md',
        className,
      )}
    >
      <span className="relative block aspect-square overflow-hidden">
        <Image
          src={category.image}
          alt=""
          fill
          sizes={sizes}
          className="object-cover transition-transform duration-500 ease-brand group-hover:scale-[1.07]"
        />
      </span>

      <span className="flex flex-col gap-0.5 px-3 py-3">
        <span className="text-small font-semibold">{category.name}</span>
        <span className="text-caption text-muted-foreground">{category.itemCount} items</span>
      </span>
    </Link>
  );
}
