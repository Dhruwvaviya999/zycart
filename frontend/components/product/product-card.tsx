'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { Price } from '@/components/product/price';
import { ProductBadgeChip } from '@/components/product/product-badge';
import { Rating } from '@/components/product/rating';
import { WishlistButton } from '@/components/product/wishlist-button';
import { useCartStore } from '@/store/cart-store';
import { imageAlt, isInStock, productBadge } from '@/lib/product';
import type { ProductSummary } from '@/types/product';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: ProductSummary;
  /** Tells the image loader how much width the card gets at each breakpoint. */
  sizes?: string;
  priority?: boolean;
  /** Replaces the hover quick-add — used where the page owns the primary action. */
  footer?: React.ReactNode;
  /** Heading level, so the card sits correctly in each page's outline. */
  as?: 'h2' | 'h3';
  className?: string;
}

const DEFAULT_SIZES = '(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 45vw';

export function ProductCard({
  product,
  sizes = DEFAULT_SIZES,
  priority = false,
  footer,
  as: Heading = 'h3',
  className,
}: ProductCardProps) {
  const add = useCartStore((state) => state.add);
  const [justAdded, setJustAdded] = useState(false);

  const [primary, secondary] = product.images;
  const badge = productBadge(product);
  const inStock = isInStock(product);

  function handleQuickAdd(event: React.MouseEvent) {
    event.preventDefault();
    add(product.id, {
      size: product.sizes.find((option) => option.inStock)?.label,
      color: product.colors[0]?.name,
    });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1600);
  }

  return (
    <article className={cn('group/card relative flex flex-col', className)}>
      <div className="relative overflow-hidden rounded-2xl bg-surface ring-1 ring-border/70 transition-shadow duration-300 ease-(--ease-brand) group-hover/card:shadow-md">
        <Link
          href={`/products/${product.slug}`}
          className="focus-ring block aspect-4/5 rounded-2xl"
          aria-label={`${product.brand.name} ${product.name}`}
        >
          {primary && (
            <Image
              src={primary}
              alt={imageAlt(product, 0)}
              fill
              sizes={sizes}
              priority={priority}
              className={cn(
                'object-cover transition-all duration-500 ease-(--ease-brand)',
                secondary ? 'group-hover/card:opacity-0' : 'group-hover/card:scale-[1.045]',
              )}
            />
          )}

          {secondary && (
            <Image
              src={secondary}
              alt=""
              aria-hidden
              fill
              sizes={sizes}
              className="scale-[1.03] object-cover opacity-0 transition-all duration-500 ease-(--ease-brand) group-hover/card:scale-100 group-hover/card:opacity-100"
            />
          )}

          {!inStock && (
            <div className="absolute inset-0 grid place-items-center bg-background/55 backdrop-blur-[2px]">
              <span className="text-label rounded-full bg-background px-3 py-1.5 text-foreground shadow-sm">
                Out of stock
              </span>
            </div>
          )}
        </Link>

        {badge && (
          <div className="pointer-events-none absolute top-3 left-3 z-20 flex flex-wrap gap-1.5">
            <ProductBadgeChip badge={badge} />
          </div>
        )}

        <WishlistButton
          productId={product.id}
          productName={product.name}
          className="absolute top-2.5 right-2.5 z-20"
        />

        {/* Quick add: always reachable by keyboard, revealed on pointer hover. */}
        {!footer && (
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={!inStock}
            aria-label={`Add ${product.name} to cart`}
            className={cn(
              'focus-ring absolute right-2.5 bottom-2.5 z-20 inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-semibold shadow-md transition-all duration-300 ease-(--ease-brand)',
              'translate-y-2 opacity-0 group-hover/card:translate-y-0 group-hover/card:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100',
              'max-sm:translate-y-0 max-sm:opacity-100',
              justAdded
                ? 'bg-success text-success-foreground'
                : 'bg-foreground text-background hover:bg-foreground/90',
              'disabled:pointer-events-none disabled:opacity-0',
            )}
          >
            {justAdded ? <Check className="size-4" /> : <Plus className="size-4" />}
            <span>{justAdded ? 'Added' : 'Add'}</span>
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 pt-3.5">
        <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">
          {product.brand.name}
        </p>

        <Heading className="text-small leading-snug font-medium">
          <Link href={`/products/${product.slug}`} className="focus-ring rounded-sm">
            {/* Stretches the click target over the card without nesting links. */}
            <span className="absolute inset-0 z-0" aria-hidden />
            <span className="relative line-clamp-2">{product.name}</span>
          </Link>
        </Heading>

        <Rating
          value={product.rating}
          reviewCount={product.reviewCount}
          className="relative z-10"
        />

        <Price
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          className="relative z-10 mt-0.5"
        />

        {/* Sits above the stretched link so its controls stay clickable. */}
        {footer && <div className="relative z-10 mt-3.5">{footer}</div>}
      </div>
    </article>
  );
}
