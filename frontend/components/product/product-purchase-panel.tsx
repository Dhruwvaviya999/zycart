'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, RotateCcw, ShieldCheck, ShoppingBag, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/product/price';
import { QuantitySelector } from '@/components/product/quantity-selector';
import { Rating } from '@/components/product/rating';
import { WishlistButton } from '@/components/product/wishlist-button';
import { useCartStore } from '@/store/cart-store';
import type { Product } from '@/types/product';
import { cn } from '@/lib/utils';

const ASSURANCES = [
  { icon: Truck, label: 'Free delivery above ₹999' },
  { icon: RotateCcw, label: '30-day returns' },
  { icon: ShieldCheck, label: '2-year warranty' },
];

export function ProductPurchasePanel({ product }: { product: Product }) {
  const add = useCartStore((state) => state.add);

  const [size, setSize] = useState(product.sizes?.find((option) => option.available)?.value);
  const [color, setColor] = useState(product.colors?.[0]?.value);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  function addToCart() {
    add(product.id, { size, color, quantity });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className="flex flex-col">
      <p className="text-label text-brand">{product.brand}</p>
      <h1 className="text-h1 mt-2.5">{product.name}</h1>
      <p className="text-body mt-3 text-pretty text-muted-foreground">{product.tagline}</p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Rating value={product.rating} reviewCount={product.reviewCount} showStars size="md" />
        <span
          className={cn(
            'text-caption inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
            product.inStock ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              product.inStock ? 'bg-success' : 'bg-muted-foreground',
            )}
          />
          {product.inStock ? 'In stock' : 'Out of stock'}
        </span>
      </div>

      <Price
        price={product.price}
        compareAtPrice={product.compareAtPrice}
        size="lg"
        className="mt-6"
      />
      <p className="text-caption mt-1.5 text-muted-foreground">Inclusive of all taxes</p>

      {product.colors && product.colors.length > 0 && (
        <fieldset className="mt-8">
          <legend className="text-small font-semibold">
            Colour
            <span className="ml-2 font-normal text-muted-foreground">
              {product.colors.find((option) => option.value === color)?.label}
            </span>
          </legend>

          <div className="mt-3 flex flex-wrap gap-2.5">
            {product.colors.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setColor(option.value)}
                aria-pressed={color === option.value}
                aria-label={option.label}
                className={cn(
                  'focus-ring grid size-9 place-items-center rounded-full ring-1 transition-all',
                  color === option.value
                    ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                    : 'ring-border hover:ring-foreground/30',
                )}
              >
                <span
                  className="size-7 rounded-full"
                  style={{ backgroundColor: option.swatch }}
                  aria-hidden
                />
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {product.sizes && product.sizes.length > 0 && (
        <fieldset className="mt-7">
          <legend className="text-small flex w-full items-center justify-between font-semibold">
            Size
          </legend>

          <div className="mt-3 flex flex-wrap gap-2">
            {product.sizes.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={option.available === false}
                onClick={() => setSize(option.value)}
                aria-pressed={size === option.value}
                className={cn(
                  'focus-ring text-small h-11 min-w-16 rounded-xl border px-3 font-medium transition-all',
                  size === option.value
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:border-foreground/30',
                  option.available === false &&
                    'cursor-not-allowed border-dashed text-muted-foreground/50 line-through hover:border-border',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <QuantitySelector value={quantity} onChange={setQuantity} />
        <span className="text-caption text-muted-foreground">Maximum 10 per order</span>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button
          size="cta-lg"
          variant="brand"
          onClick={addToCart}
          disabled={!product.inStock}
          className="flex-1"
        >
          {added ? (
            <>
              <Check className="size-4" data-icon="inline-start" />
              Added to cart
            </>
          ) : (
            <>
              <ShoppingBag className="size-4" data-icon="inline-start" />
              Add to cart
            </>
          )}
        </Button>

        <Button
          size="cta-lg"
          variant="outline"
          disabled={!product.inStock}
          render={<Link href="/cart" />}
          className="flex-1"
          onClick={() => add(product.id, { size, color, quantity })}
        >
          Buy now
        </Button>

        <WishlistButton
          productId={product.id}
          productName={product.name}
          variant="inline"
          className="sm:size-12"
        />
      </div>

      <ul className="mt-8 grid gap-3 border-t border-border pt-7 sm:grid-cols-3">
        {ASSURANCES.map(({ icon: Icon, label }) => (
          <li key={label} className="text-caption flex items-center gap-2 text-muted-foreground">
            <Icon className="size-4 shrink-0 text-foreground" aria-hidden />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
