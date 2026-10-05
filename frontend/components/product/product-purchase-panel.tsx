'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Loader2, RotateCcw, ShieldCheck, ShoppingBag, Truck } from 'lucide-react';
import { AiProductCta } from '@/components/ai/ai-cta';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/product/price';
import { QuantitySelector } from '@/components/product/quantity-selector';
import { TryOnButton } from '@/components/product/try-on-button';
import { Rating } from '@/components/product/rating';
import { WishlistButton } from '@/components/product/wishlist-button';
import { VariantPicker } from '@/components/product/variant-picker';
import {
  BackInStockButton,
  PriceDropButton,
  useProductAlerts,
} from '@/components/product/product-alert-buttons';
import { toErrorMessage } from '@/services/api';
import { useCartStore } from '@/store/cart-store';
import { LOW_STOCK_THRESHOLD } from '@/lib/product';
import {
  isChoiceComplete,
  selectionStock,
  tracksVariants,
  variantLabel,
  type VariantChoice,
} from '@/lib/variants';
import type { Product } from '@/types/product';
import { cn } from '@/lib/utils';

const ASSURANCES = [
  { icon: Truck, label: 'Free delivery above ₹999' },
  /**
   * This number is a promise, and from Phase 13 it is also enforced.
   *
   * `RETURN_WINDOW_DAYS` in `backend/src/models/return.model.ts` is what the
   * server actually applies. Change one and change the other, or the shop will
   * advertise a window it refuses to honour. The same string is in
   * `data/banners.ts`.
   */
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
  /** Good news from the restock button: what it asked about is buyable after all. */
  const [notice, setNotice] = useState<string>();

  const alerts = useProductAlerts(product.id);

  /**
   * Availability follows the selection, not just the product (Phase 20).
   *
   * On a product that tracks stock per variant, "in stock" means something
   * only once the customer has said which one: twelve pairs in the shop is no
   * comfort if none are Black in a 9. So the pill, the low-stock note and the
   * quantity cap all read `selectionStock` — the whole product with nothing
   * chosen, the one variant once everything is. A product with one count
   * answers exactly as it always did, bar a size marked sold out, which the
   * page now lets a customer choose so they can ask to be told.
   */
  const tracked = tracksVariants(product);
  const complete = isChoiceComplete(product, color, size);
  const available = selectionStock(product, { color, size });
  const inStock = available > 0;
  const lowStock = inStock && available <= LOW_STOCK_THRESHOLD;
  // Never offer more than the catalogue actually holds.
  const maxQuantity = Math.min(10, Math.max(1, available));
  // Belt and braces for a re-read product that now holds fewer than were
  // chosen: the stored value is clamped on every choice, this covers the rest.
  const effectiveQuantity = Math.min(quantity, maxQuantity);

  /**
   * What a restock alert would wait for.
   *
   * The combination, once one is named; otherwise the whole product. On a
   * product with one count a colour carries no stock of its own, so only the
   * size is sent — waiting on a colour there would be waiting on nothing.
   */
  const restockChoice: VariantChoice = tracked
    ? complete
      ? { color: color ?? null, size: size ?? null }
      : {}
    : size
      ? { size }
      : {};
  const namesVariant = Boolean(restockChoice.color || restockChoice.size);

  /**
   * Offered in place of the cart buttons when nothing chosen can be bought.
   *
   * Not for a half-made choice on a product that still has stock — Black with
   * every size gone, say. "Anything in this product" would be refused as in
   * stock, and the honest next step is to pick the size they want.
   */
  const offerRestock = !inStock && (product.stock <= 0 || namesVariant);
  const missingAxis = product.colors.length > 0 && !color ? 'colour' : 'size';

  /** Every change of colour or size goes through here, so the quantity follows it. */
  function choose(next: { color?: string; size?: string }) {
    const nextColor = next.color ?? color;
    const nextSize = next.size ?? size;
    const nextMax = Math.min(
      10,
      Math.max(1, selectionStock(product, { color: nextColor, size: nextSize })),
    );

    setColor(nextColor);
    setSize(nextSize);
    setQuantity((current) => Math.min(current, nextMax));
    setNotice(undefined);
    setFormError(undefined);
  }

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
      await add({
        productId: product.id,
        quantity: effectiveQuantity,
        selectedColor: color,
        selectedSize: size,
      });
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

        {lowStock && (
          <span className="text-caption font-medium text-sale">Only {available} left</span>
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
          variants={product.variants}
          allowSoldOut
          selectedColor={color}
          selectedSize={size}
          onColorChange={(name) => {
            choose({ color: name });
            setErrors((current) => ({ ...current, color: undefined }));
          }}
          onSizeChange={(label) => {
            choose({ size: label });
            setErrors((current) => ({ ...current, size: undefined }));
          }}
          colorError={errors.color}
          sizeError={errors.size}
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <QuantitySelector value={effectiveQuantity} onChange={setQuantity} max={maxQuantity} />
        <span className="text-caption text-muted-foreground">Maximum {maxQuantity} per order</span>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Sold out: the one useful thing to offer is being told when it is
            not. Two disabled buttons beside it would only repeat the pill. */}
        {offerRestock ? (
          <BackInStockButton
            alerts={alerts}
            productId={product.id}
            slug={product.slug}
            choice={restockChoice}
            onInStockNow={(message) => {
              setNotice(message);
              // The page was rendered before the delivery: re-read the
              // product so the cart buttons come back with the right count.
              router.refresh();
            }}
            className="flex-1"
          />
        ) : (
          <>
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
          </>
        )}

        <WishlistButton
          productId={product.id}
          productName={product.name}
          variant="inline"
          className="sm:size-12"
        />
      </div>

      {!inStock && !offerRestock && (
        <p className="text-caption mt-3 text-pretty text-muted-foreground">
          {variantLabel({ color, size })} is sold out. Choose a {missingAxis} to be told when it’s
          back.
        </p>
      )}

      {formError && (
        <p role="alert" className="text-small mt-3 font-medium text-destructive">
          {formError}
        </p>
      )}

      {notice && (
        <p role="status" className="text-small mt-3 font-medium text-success">
          {notice}
        </p>
      )}

      {/* Always on offer, and always quiet: waiting for a lower price is the
          opposite of buying now, so it must not look like the way to buy. */}
      <PriceDropButton
        alerts={alerts}
        productId={product.id}
        slug={product.slug}
        className="mt-4"
      />

      {/*
        Below the purchase controls, not beside them. A question about the
        product is a step before buying it, so it must not compete with the
        button that does. Renders nothing when the store has no assistant.
      */}
      {/*
        Try-on sits with the assistant: both help decide, neither buys. It is
        handed the page's own add-to-cart, so adding from the fitting room
        applies the same size and colour rules as the button above. Renders
        nothing for goods that cannot be worn, or when the store has no try-on.
      */}
      <TryOnButton product={product} colour={color} onAddToCart={addToCart} className="mt-4" />

      <AiProductCta productId={product.id} productName={product.name} className="mt-3" />

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
