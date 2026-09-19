'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Check, Loader2, Plus, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Price } from '@/components/product/price';
import { Rating } from '@/components/product/rating';
import { useCartStore } from '@/store/cart-store';
import type { AiProductResult } from '@/types/ai';
import { cn } from '@/lib/utils';

/**
 * A product the assistant found, in the storefront's own visual language.
 *
 * Every number on it — price, strike-through, rating, stock — came from the
 * server on this turn, alongside the reply. Nothing is parsed out of what the
 * assistant wrote, so the card cannot disagree with the catalogue even if the
 * reply does.
 *
 * Laid out horizontally rather than as a `ProductCard`: these sit in a 420px
 * chat panel on desktop and a phone-width sheet on mobile, where a 4:5 image
 * tile would leave one product per screen.
 */

interface AiProductCardProps {
  product: AiProductResult;
  /** Its position in the assistant's list, so "the second one" is countable. */
  index: number;
  onNavigate?: () => void;
}

export function AiProductCard({ product, index, onNavigate }: AiProductCardProps) {
  const add = useCartStore((state) => state.add);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const href = `/products/${product.slug}`;
  const inStock = product.availability !== 'out_of_stock';

  /**
   * A product with options is never added on a guess — the same rule the
   * storefront's own card follows, and the same rule the assistant follows when
   * it is asked to add one. Here it sends the customer to the product page,
   * where the full picker lives.
   */
  const needsVariant = product.colors.length > 0 || product.sizes.length > 0;

  async function handleAdd() {
    setAdding(true);
    try {
      await add({ productId: product.id, quantity: 1 });
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1600);
    } catch {
      // The cart store holds the message; the card stays quiet rather than
      // shouting inside a conversation.
    } finally {
      setAdding(false);
    }
  }

  return (
    <article className="flex gap-3 rounded-xl border border-border bg-card p-2.5 transition-colors hover:border-brand/30">
      <Link
        href={href}
        onClick={onNavigate}
        tabIndex={-1}
        aria-hidden
        className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-surface sm:size-20"
      >
        {product.images[0] && (
          <Image
            src={product.images[0]}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
            unoptimized={false}
          />
        )}

        {!inStock && (
          <span className="absolute inset-0 grid place-items-center bg-background/60 text-[10px] font-semibold backdrop-blur-[1px]">
            Sold out
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-caption truncate font-medium tracking-wide text-muted-foreground uppercase">
          <span className="sr-only">Result {index + 1}: </span>
          {product.brand}
        </p>

        <h3 className="text-small leading-snug font-medium">
          <Link href={href} onClick={onNavigate} className="focus-ring rounded-sm hover:underline">
            {product.name}
          </Link>
        </h3>

        <Rating value={product.rating} reviewCount={product.reviewCount} />

        <Price price={product.price} compareAtPrice={product.compareAtPrice} className="mt-0.5" />

        {/* Low stock is said in words as well as tone, so it does not depend on
            colour alone to be noticed. */}
        {product.availability === 'low_stock' && (
          <p className="text-caption font-medium text-sale">Only {product.stock} left</p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {inStock &&
            (needsVariant ? (
              <Link
                href={href}
                onClick={onNavigate}
                className="focus-ring text-caption inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 font-semibold text-background transition-colors hover:bg-foreground/90"
              >
                <SlidersHorizontal className="size-3.5" aria-hidden />
                Choose options
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleAdd}
                disabled={adding}
                aria-label={`Add ${product.name} to cart`}
                className={cn(
                  'focus-ring text-caption inline-flex h-8 items-center gap-1.5 rounded-lg px-3 font-semibold transition-colors disabled:opacity-60',
                  added
                    ? 'bg-success text-success-foreground'
                    : 'bg-foreground text-background hover:bg-foreground/90',
                )}
              >
                {adding ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : added ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <Plus className="size-3.5" aria-hidden />
                )}
                {added ? 'Added' : 'Add to cart'}
              </button>
            ))}

          <Link
            href={href}
            onClick={onNavigate}
            className="focus-ring text-caption inline-flex h-8 items-center rounded-lg border border-border px-3 font-medium transition-colors hover:bg-muted"
          >
            View product
          </Link>
        </div>
      </div>
    </article>
  );
}
