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
import { isInStock, isLowStock } from '@/lib/product';
import type { Product } from '@/types/product';
import { cn } from '@/lib/utils';

const ASSURANCES = [
  { icon: Truck, label: 'Free delivery above ₹999' },
  { icon: RotateCcw, label: '30-day returns' },
  { icon: ShieldCheck, label: '2-year warranty' },
];

export function ProductPurchasePanel({ product }: { product: Product }) {
  const add = useCartStore((state) => state.add);

  const [size, setSize] = useState(product.sizes.find((option) => option.inStock)?.label);
  const [color, setColor] = useState(product.colors[0]?.name);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const inStock = isInStock(product);
  // Never offer more than the catalogue actually holds.
  const maxQuantity = Math.min(10, Math.max(1, product.stock));

  function addToCart() {
    add(product.id, { size, color, quantity });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className="flex flex-col">
      <p className="text-label text-brand">{product.brand.name}</p>
      <h1 className="text-h1 mt-2.5">{product.name}</h1>
      <p className="text-body mt-3 text-pretty text-muted-foreground">{product.shortDescription}</p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Rating value={product.rating} reviewCount={product.reviewCount} showStars size="md" />
        <span
          className={cn(
            'text-caption inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
            inStock ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
          )}
        >
          <span
            className={cn('size-1.5 rounded-full', inStock ? 'bg-success' : 'bg-muted-foreground')}
          />
          {inStock ? 'In stock' : 'Out of stock'}
        </span>

        {isLowStock(product) && (
          <span className="text-caption font-medium text-sale">Only {product.stock} left</span>
        )}
      </div>

      <Price
        price={product.price}
        compareAtPrice={product.compareAtPrice}
        size="lg"
        className="mt-6"
      />
      <p className="text-caption mt-1.5 text-muted-foreground">Inclusive of all taxes</p>

      {product.colors.length > 0 && (
        <fieldset className="mt-8">
          <legend className="text-small font-semibold">
            Colour
            <span className="ml-2 font-normal text-muted-foreground">{color}</span>
          </legend>

          <div className="mt-3 flex flex-wrap gap-2.5">
            {product.colors.map((option) => (
              <button
                key={option.name}
                type="button"
                onClick={() => setColor(option.name)}
                aria-pressed={color === option.name}
                aria-label={option.name}
                className={cn(
                  'focus-ring grid size-9 place-items-center rounded-full ring-1 transition-all',
                  color === option.name
                    ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                    : 'ring-border hover:ring-foreground/30',
                )}
              >
                <span
                  className="size-7 rounded-full"
                  style={{ backgroundColor: option.hex }}
                  aria-hidden
                />
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {product.sizes.length > 0 && (
        <fieldset className="mt-7">
          <legend className="text-small flex w-full items-center justify-between font-semibold">
            Size
          </legend>

          <div className="mt-3 flex flex-wrap gap-2">
            {product.sizes.map((option) => (
              <button
                key={option.label}
                type="button"
                disabled={!option.inStock}
                onClick={() => setSize(option.label)}
                aria-pressed={size === option.label}
                className={cn(
                  'focus-ring text-small h-11 min-w-16 rounded-xl border px-3 font-medium transition-all',
                  size === option.label
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:border-foreground/30',
                  !option.inStock &&
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
        <QuantitySelector value={quantity} onChange={setQuantity} max={maxQuantity} />
        <span className="text-caption text-muted-foreground">Maximum {maxQuantity} per order</span>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button
          size="cta-lg"
          variant="brand"
          onClick={addToCart}
          disabled={!inStock}
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
          disabled={!inStock}
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

      <dl className="text-caption mt-7 flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">
        <div className="flex gap-1.5">
          <dt>SKU</dt>
          <dd className="font-medium text-foreground">{product.sku}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Category</dt>
          <dd className="font-medium text-foreground">{product.category.name}</dd>
        </div>
      </dl>

      <ul className="mt-6 grid gap-3 border-t border-border pt-7 sm:grid-cols-3">
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
