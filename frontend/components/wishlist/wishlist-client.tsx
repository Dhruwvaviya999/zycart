'use client';

import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { ProductGridSkeleton } from '@/components/common/loading-state';
import { Container } from '@/components/layout/container';
import { ProductGrid } from '@/components/product/product-grid';
import { useProductsByIds } from '@/hooks/use-products-by-ids';
import { isInStock } from '@/lib/product';
import { useCartStore } from '@/store/cart-store';
import { useWishlistStore } from '@/store/wishlist-store';
import type { ProductSummary } from '@/types/product';

export function WishlistClient() {
  const hydrated = useWishlistStore((state) => state.hydrated);
  const ids = useWishlistStore((state) => state.ids);
  const removeSaved = useWishlistStore((state) => state.remove);
  const addToCart = useCartStore((state) => state.add);

  const { products, status, error, retry } = useProductsByIds(ids, hydrated);

  // Preserve the order the shopper saved them in.
  const saved = ids.reduce<ProductSummary[]>((acc, id) => {
    const product = products.get(id);
    if (product) acc.push(product);
    return acc;
  }, []);

  const loading = !hydrated || (status === 'loading' && ids.length > 0);

  function moveToCart(product: ProductSummary) {
    addToCart(product.id, {
      size: product.sizes.find((option) => option.inStock)?.label,
      color: product.colors[0]?.name,
    });
    removeSaved(product.id);
  }

  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Wishlist' }]} />

      <header className="mt-5">
        <h1 className="text-h1">Wishlist</h1>
        <p className="text-small mt-2 text-muted-foreground">
          {loading
            ? 'Loading your saved products...'
            : `${saved.length} ${saved.length === 1 ? 'product' : 'products'} saved`}
        </p>
      </header>

      {loading ? (
        <ProductGridSkeleton count={4} className="mt-10" />
      ) : status === 'error' ? (
        <ErrorState
          title="We could not load your wishlist."
          body={error ?? 'Your saved products are safe — we just could not fetch them.'}
          onRetry={retry}
          secondaryAction={{ label: 'Keep shopping', href: '/shop' }}
          className="mt-10"
        />
      ) : saved.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Your wishlist is waiting."
          body="Save products you love and come back to them anytime. Tap the heart on any product to add it here."
          action={{ label: 'Continue shopping', href: '/shop' }}
          className="mt-10"
        />
      ) : (
        /* The same card as everywhere else; only the action row differs. */
        <ProductGrid
          products={saved}
          columns={4}
          priorityCount={4}
          cardHeading="h2"
          className="mt-10"
          renderFooter={(product) => (
            <div className="flex gap-2">
              <Button
                size="cta"
                variant="brand"
                className="min-w-0 flex-1"
                disabled={!isInStock(product)}
                onClick={() => moveToCart(product)}
              >
                <ShoppingBag className="size-4" data-icon="inline-start" />
                <span className="truncate">
                  {isInStock(product) ? 'Move to cart' : 'Out of stock'}
                </span>
              </Button>

              <Button
                size="icon-cta"
                variant="outline"
                aria-label={`Remove ${product.name} from wishlist`}
                onClick={() => removeSaved(product.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        />
      )}
    </Container>
  );
}
