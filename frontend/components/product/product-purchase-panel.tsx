'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Loader2, RotateCcw, ShieldCheck, ShoppingBag, Truck } from 'lucide-react';
import { AiProductCta } from '@/components/ai/ai-cta';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/product/price';
import { QuantitySelector } from '@/components/product/quantity-selector';
import { Rating } from '@/components/product/rating';
import { WishlistButton } from '@/components/product/wishlist-button';
import { VariantPicker } from '@/components/product/variant-picker';
import { toErrorMessage } from '@/services/api';
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
  const router = useRouter();
  const add = useCartStore((state) => state.add);

  // Nothing is preselected: the customer chooses, and is told if they have not.
  const [size, setSize] = useState<string>();
  const [color, setColor] = useState<string>();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ color?: string; size?: string }>({});
  const [formError, setFormError] = useState<string>();

  const inStock = isInStock(product);
  // Never offer more than the catalogue actually holds.
  const maxQuantity = Math.min(10, Math.max(1, product.stock));

  /** Returns false and marks the missing choice rather than calling the API. */
  function validate(): boolean {
    const next: { color?: string; size?: string } = {};
    if (product.colors.length > 0 && !color) next.color = 'Please choose a colour';
    if (product.sizes.length > 0 && !size) next.size = 'Please choose a size';

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function addToCart(): Promise<boolean> {
    if (busy) return false;
    if (!validate()) return false;

    setBusy(true);
    setFormError(undefined);

    try {
      await add({ productId: product.id, quantity, selectedColor: color, selectedSize: size });
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1800);
      return true;
    } catch (error) {
      setFormError(toErrorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col">
      <p className="text-label text-brand">{product.brand.name}</p>
      <h1 className="text-h1 mt-2.5">{product.name}</h1>
      <p className="text-body mt-3 text-pretty text-muted-foreground">{product.shortDescription}</p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        {/* A rating nobody can act on is a missed affordance: this jumps
            straight to the reviews behind it. Unrated products get plain text,
            because there is nothing to jump to. */}
        {product.reviewCount > 0 ? (
          <a href="#reviews" className="focus-ring rounded-md transition-opacity hover:opacity-80">
            <Rating value={product.rating} reviewCount={product.reviewCount} showStars size="md" />
            <span className="sr-only">Read all {product.reviewCount} reviews</span>
          </a>
        ) : (
          <Rating value={product.rating} reviewCount={product.reviewCount} showStars size="md" />
        )}
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

      <div className="mt-8">
        <VariantPicker
          colors={product.colors}
          sizes={product.sizes}
          selectedColor={color}
          selectedSize={size}
          onColorChange={(name) => {
            setColor(name);
            setErrors((current) => ({ ...current, color: undefined }));
          }}
          onSizeChange={(label) => {
            setSize(label);
            setErrors((current) => ({ ...current, size: undefined }));
          }}
          colorError={errors.color}
          sizeError={errors.size}
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <QuantitySelector value={quantity} onChange={setQuantity} max={maxQuantity} />
        <span className="text-caption text-muted-foreground">Maximum {maxQuantity} per order</span>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button
          size="cta-lg"
          variant="brand"
          onClick={() => void addToCart()}
          disabled={!inStock || busy}
          className="flex-1"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              Adding...
            </>
          ) : added ? (
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

        {/* Navigates only once the item is actually in the bag, so a missing
            size cannot land the customer on an unchanged cart. */}
        <Button
          size="cta-lg"
          variant="outline"
          disabled={!inStock || busy}
          className="flex-1"
          onClick={async () => {
            if (await addToCart()) router.push('/cart');
          }}
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

      {formError && (
        <p role="alert" className="text-small mt-3 font-medium text-destructive">
          {formError}
        </p>
      )}

      {/*
        Below the purchase controls, not beside them. A question about the
        product is a step before buying it, so it must not compete with the
        button that does. Renders nothing when the store has no assistant.
      */}
      <AiProductCta productId={product.id} productName={product.name} className="mt-4" />

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
