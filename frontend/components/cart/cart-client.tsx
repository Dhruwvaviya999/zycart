'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookmarkPlus, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { EmptyState } from '@/components/common/empty-state';
import { CartSkeleton } from '@/components/common/loading-state';
import { Container } from '@/components/layout/container';
import { QuantitySelector } from '@/components/product/quantity-selector';
import { selectCartSummary, useCartStore, type ResolvedCartLine } from '@/store/cart-store';
import { formatPrice } from '@/lib/format';
import { categoryName } from '@/data/categories';

export function CartClient() {
  const hydrated = useCartStore((state) => state.hydrated);
  const lines = useCartStore((state) => state.lines);
  const saved = useCartStore((state) => state.savedForLater);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const remove = useCartStore((state) => state.remove);
  const saveForLater = useCartStore((state) => state.saveForLater);
  const moveToCart = useCartStore((state) => state.moveToCart);
  const removeSaved = useCartStore((state) => state.removeSaved);

  const summary = selectCartSummary(lines);
  const savedSummary = selectCartSummary(saved);

  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Cart' }]} />

      <header className="mt-5">
        <h1 className="text-h1">Your cart</h1>
        <p className="text-small mt-2 text-muted-foreground">
          {hydrated
            ? `${summary.itemCount} ${summary.itemCount === 1 ? 'item' : 'items'}`
            : 'Loading your cart...'}
        </p>
      </header>

      {!hydrated ? (
        <CartSkeleton className="mt-10" />
      ) : summary.items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty."
          body="Nothing here yet. Browse the catalogue and the things you add will show up right here."
          action={{ label: 'Start shopping', href: '/shop' }}
          secondaryAction={{ label: 'View wishlist', href: '/wishlist' }}
          className="mt-10"
        />
      ) : (
        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          <div>
            {summary.freeShippingRemaining > 0 && (
              <div className="mb-6 rounded-2xl border border-brand/20 bg-brand-subtle px-5 py-4">
                <p className="text-small font-medium text-brand">
                  Add {formatPrice(summary.freeShippingRemaining)} more for free shipping.
                </p>
                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand/15"
                  role="progressbar"
                  aria-valuenow={summary.subtotal}
                  aria-valuemin={0}
                  aria-valuemax={summary.freeShippingThreshold}
                >
                  <div
                    className="h-full rounded-full bg-brand transition-[width] duration-500 ease-brand"
                    style={{
                      width: `${Math.min(100, (summary.subtotal / summary.freeShippingThreshold) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <ul className="divide-y divide-border border-y border-border">
              {summary.items.map((item) => (
                <CartRow
                  key={item.line.productId}
                  item={item}
                  onQuantity={(next) => setQuantity(item.line.productId, next)}
                  onRemove={() => remove(item.line.productId)}
                  onSave={() => saveForLater(item.line.productId)}
                />
              ))}
            </ul>

            {savedSummary.items.length > 0 && (
              <section className="mt-12">
                <h2 className="text-h3">Saved for later</h2>
                <ul className="mt-5 divide-y divide-border border-y border-border">
                  {savedSummary.items.map((item) => (
                    <li key={item.line.productId} className="flex items-center gap-4 py-5 sm:gap-5">
                      <Link
                        href={`/products/${item.product.slug}`}
                        className="focus-ring relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface"
                      >
                        {item.product.images[0] && (
                          <Image
                            src={item.product.images[0].url}
                            alt=""
                            fill
                            sizes="80px"
                            className="object-cover"
                          />
                        )}
                      </Link>

                      <div className="min-w-0 flex-1">
                        <p className="text-caption text-muted-foreground">{item.product.brand}</p>
                        <p className="text-small truncate font-medium">{item.product.name}</p>
                        <p className="text-price mt-1">{formatPrice(item.product.price)}</p>
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => moveToCart(item.line.productId)}
                        >
                          Move to cart
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove ${item.product.name}`}
                          onClick={() => removeSaved(item.line.productId)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="lg:sticky lg:top-24">
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-h4">Order summary</h2>

              <dl className="mt-5 space-y-3">
                <SummaryRow label={`Subtotal (${summary.itemCount} items)`}>
                  {formatPrice(summary.subtotal)}
                </SummaryRow>

                {summary.savings > 0 && (
                  <SummaryRow label="Discount" tone="success">
                    −{formatPrice(summary.savings)}
                  </SummaryRow>
                )}

                <SummaryRow label="Shipping">
                  {summary.shipping === 0 ? (
                    <span className="text-success">Free</span>
                  ) : (
                    formatPrice(summary.shipping)
                  )}
                </SummaryRow>
              </dl>

              <Separator className="my-5" />

              <div className="flex items-baseline justify-between">
                <span className="text-h4">Total</span>
                <span className="text-price-lg">{formatPrice(summary.total)}</span>
              </div>
              <p className="text-caption mt-1.5 text-muted-foreground">Inclusive of all taxes</p>

              <Button size="cta-lg" variant="brand" className="mt-6 w-full">
                Proceed to checkout
                <ArrowRight className="size-4" data-icon="inline-end" />
              </Button>

              <p className="text-caption mt-3 text-center text-muted-foreground">
                Checkout is not connected yet — this is a Phase 2 preview.
              </p>
            </div>
          </aside>
        </div>
      )}
    </Container>
  );
}

function SummaryRow({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: 'success';
  children: React.ReactNode;
}) {
  return (
    <div className="text-small flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={tone === 'success' ? 'font-medium text-success' : 'font-medium'}>
        {children}
      </dd>
    </div>
  );
}

interface CartRowProps {
  item: ResolvedCartLine;
  onQuantity: (next: number) => void;
  onRemove: () => void;
  onSave: () => void;
}

function CartRow({ item, onQuantity, onRemove, onSave }: CartRowProps) {
  const { product, line } = item;
  const variant = [line.color, line.size].filter(Boolean).join(' · ');

  return (
    <li className="flex gap-4 py-6 sm:gap-5">
      <Link
        href={`/products/${product.slug}`}
        className="focus-ring relative size-24 shrink-0 overflow-hidden rounded-xl bg-surface sm:size-28"
      >
        {product.images[0] && (
          <Image
            src={product.images[0].url}
            alt={product.images[0].alt}
            fill
            sizes="112px"
            className="object-cover"
          />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-caption text-muted-foreground">{product.brand}</p>
            <h3 className="text-small font-medium">
              <Link href={`/products/${product.slug}`} className="focus-ring rounded-sm">
                {product.name}
              </Link>
            </h3>
            <p className="text-caption mt-1 text-muted-foreground">
              {variant || categoryName(product.category)}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-price">{formatPrice(product.price * line.quantity)}</p>
            {product.compareAtPrice && (
              <p className="text-caption text-muted-foreground line-through">
                {formatPrice(product.compareAtPrice * line.quantity)}
              </p>
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <QuantitySelector value={line.quantity} onChange={onQuantity} size="sm" />

          <Button size="sm" variant="ghost" onClick={onSave} className="text-muted-foreground">
            <BookmarkPlus className="size-3.5" data-icon="inline-start" />
            Save for later
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" data-icon="inline-start" />
            Remove
          </Button>
        </div>
      </div>
    </li>
  );
}
