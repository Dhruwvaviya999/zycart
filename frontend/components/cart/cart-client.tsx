'use client';

import { AlertTriangle, ShoppingBag } from 'lucide-react';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { CartSkeleton } from '@/components/common/loading-state';
import { Container } from '@/components/layout/container';
import { CartItem } from '@/components/cart/cart-item';
import { CartSummary } from '@/components/cart/cart-summary';
import { useCartStore } from '@/store/cart-store';
import { useWishlistStore } from '@/store/wishlist-store';

export function CartClient() {
  const cart = useCartStore((state) => state.cart);
  const status = useCartStore((state) => state.status);
  const error = useCartStore((state) => state.error);
  const pendingIds = useCartStore((state) => state.pendingIds);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const remove = useCartStore((state) => state.remove);
  const refresh = useCartStore((state) => state.refresh);
  const saveToWishlist = useWishlistStore((state) => state.save);

  // `idle` means the session has not been resolved yet — showing "your cart is
  // empty" before we know would be a lie.
  const loading = status === 'idle' || status === 'loading';

  /** Moves the line into the wishlist, then out of the bag — in that order, so
      a failure to save never costs the customer the item. */
  async function saveForLater(itemId: string, productId: string) {
    await saveToWishlist(productId);
    await remove(itemId);
  }

  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Cart' }]} />

      <header className="mt-5">
        <h1 className="text-h1">Your cart</h1>
        <p className="text-small mt-2 text-muted-foreground" aria-live="polite">
          {loading
            ? 'Loading your cart...'
            : `${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'items'}`}
        </p>
      </header>

      {loading ? (
        <CartSkeleton className="mt-10" />
      ) : status === 'error' ? (
        <ErrorState
          title="We could not load your cart."
          body={error ?? 'Your items are safe — this is a display problem on our side.'}
          onRetry={() => void refresh()}
          secondaryAction={{ label: 'Keep shopping', href: '/shop' }}
          className="mt-10"
        />
      ) : cart.items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is waiting."
          body="Nothing here yet. Browse the catalogue and whatever you add will show up right here."
          action={{ label: 'Start shopping', href: '/shop' }}
          secondaryAction={{ label: 'View wishlist', href: '/wishlist' }}
          className="mt-10"
        />
      ) : (
        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          <div>
            {/* Anything the server adjusted — a quantity clamped to stock, an
                item that could not be merged — is said plainly, once. */}
            {cart.notices.length > 0 && (
              <div
                role="status"
                className="mb-6 flex items-start gap-2.5 rounded-2xl border border-sale/25 bg-sale/5 px-4 py-3"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-sale" aria-hidden />
                <div className="text-small space-y-1 font-medium text-sale">
                  {cart.notices.map((notice) => (
                    <p key={notice}>{notice}</p>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="text-small mb-5 font-medium text-destructive">
                {error}
              </p>
            )}

            <ul className="divide-y divide-border border-y border-border">
              {cart.items.map((item) => (
                <CartItem
                  key={item.id}
                  item={item}
                  busy={pendingIds.includes(item.id)}
                  onQuantityChange={(quantity) => void setQuantity(item.id, quantity)}
                  onRemove={() => void remove(item.id)}
                  onSaveForLater={
                    item.product ? () => void saveForLater(item.id, item.product!.id) : undefined
                  }
                />
              ))}
            </ul>
          </div>

          <aside className="lg:sticky lg:top-24">
            <CartSummary cart={cart} />
          </aside>
        </div>
      )}
    </Container>
  );
}
