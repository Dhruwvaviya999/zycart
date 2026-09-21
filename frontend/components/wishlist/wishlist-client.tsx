'use client';

import { useState } from 'react';
import { AlertTriangle, Heart, Loader2, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { ProductGridSkeleton } from '@/components/common/loading-state';
import { Container } from '@/components/layout/container';
import { ProductCard } from '@/components/product/product-card';
import { QuickAddDialog } from '@/components/product/quick-add-dialog';
import { useCartStore } from '@/store/cart-store';
import { useWishlistStore } from '@/store/wishlist-store';
import { isInStock } from '@/lib/product';
import type { ProductSummary } from '@/types/product';
import type { WishlistItem } from '@/types/wishlist';

export function WishlistClient() {
  const wishlist = useWishlistStore((state) => state.wishlist);
  const status = useWishlistStore((state) => state.status);
  const error = useWishlistStore((state) => state.error);
  const pending = useWishlistStore((state) => state.pendingProductIds);
  const removeByItemId = useWishlistStore((state) => state.removeByItemId);
  const refresh = useWishlistStore((state) => state.refresh);
  const add = useCartStore((state) => state.add);

  const [picking, setPicking] = useState<ProductSummary | null>(null);
  const [movingId, setMovingId] = useState<string>();

  const loading = status === 'idle' || status === 'loading';

  /**
   * Moving a saved product into the bag. A product with options opens the
   * picker instead of guessing, and the item is only unsaved once the add has
   * actually succeeded.
   */
  async function moveToCart(item: WishlistItem) {
    const product = item.product;
    if (!product) return;

    if (product.colors.length > 0 || product.sizes.length > 0) {
      setPicking(product);
      return;
    }

    setMovingId(item.id);
    try {
      await add({ productId: product.id, quantity: 1 });
      await removeByItemId(item.id);
    } finally {
      setMovingId(undefined);
    }
  }

  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Wishlist' }]} />

      <header className="mt-5">
        <h1 className="text-h1">Wishlist</h1>
        <p className="text-small mt-2 text-muted-foreground" aria-live="polite">
          {loading
            ? 'Loading your saved products...'
            : `${wishlist.itemCount} ${wishlist.itemCount === 1 ? 'product' : 'products'} saved`}
        </p>
      </header>

      {loading ? (
        <ProductGridSkeleton count={4} className="mt-10" />
      ) : status === 'error' ? (
        <ErrorState
          title="We could not load your wishlist."
          body={error ?? 'Your saved products are safe — we just could not fetch them.'}
          onRetry={() => void refresh()}
          secondaryAction={{ label: 'Keep shopping', href: '/shop' }}
          className="mt-10"
        />
      ) : wishlist.items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Nothing saved yet."
          body="Keep the products you love close. Tap the heart on anything in the shop and it will be waiting here."
          action={{ label: 'Explore products', href: '/shop' }}
          className="mt-10"
        />
      ) : (
        <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-4">
          {wishlist.items.map((item) => {
            const busy = pending.includes(item.product?.id ?? item.id) || movingId === item.id;

            // A product that has since been withdrawn still needs somewhere to
            // live, and a way out.
            if (!item.product) {
              return (
                <li key={item.id}>
                  <div className="flex h-full flex-col rounded-2xl border border-dashed border-border bg-surface/60 p-5">
                    <AlertTriangle className="size-5 text-muted-foreground" aria-hidden />
                    <p className="text-small mt-3 font-semibold">Currently unavailable</p>
                    <p className="text-caption mt-1 flex-1 text-muted-foreground">
                      This product is no longer sold on ZyCart.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void removeByItemId(item.id)}
                      className="mt-4"
                    >
                      <Trash2 className="size-3.5" data-icon="inline-start" />
                      Remove
                    </Button>
                  </div>
                </li>
              );
            }

            return (
              <li key={item.id}>
                {/* The same card the rest of the storefront uses; only the
                    action row underneath differs. */}
                <ProductCard
                  product={item.product}
                  as="h2"
                  footer={
                    <div className="flex gap-2">
                      <Button
                        size="cta"
                        variant="brand"
                        className="min-w-0 flex-1"
                        disabled={!isInStock(item.product) || busy}
                        onClick={() => void moveToCart(item)}
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                        ) : (
                          <ShoppingBag className="size-4" data-icon="inline-start" />
                        )}
                        <span className="truncate">
                          {isInStock(item.product) ? 'Move to cart' : 'Out of stock'}
                        </span>
                      </Button>

                      <Button
                        size="icon-cta"
                        variant="outline"
                        disabled={busy}
                        aria-label={`Remove ${item.product.name} from wishlist`}
                        onClick={() => void removeByItemId(item.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      {picking && (
        <QuickAddDialog
          product={picking}
          open
          onOpenChange={(open) => !open && setPicking(null)}
          onAdded={() => {
            const item = wishlist.items.find((entry) => entry.product?.id === picking.id);
            if (item) void removeByItemId(item.id);
            setPicking(null);
          }}
        />
      )}
    </Container>
  );
}
