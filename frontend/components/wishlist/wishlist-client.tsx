'use client';

import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { EmptyState } from '@/components/common/empty-state';
import { ProductGridSkeleton } from '@/components/common/loading-state';
import { Container } from '@/components/layout/container';
import { ProductGrid } from '@/components/product/product-grid';
import { productById } from '@/data/products';
import { useCartStore } from '@/store/cart-store';
import { useWishlistStore } from '@/store/wishlist-store';
import type { Product } from '@/types/product';

export function WishlistClient() {
  const hydrated = useWishlistStore((state) => state.hydrated);
  const ids = useWishlistStore((state) => state.ids);
  const removeSaved = useWishlistStore((state) => state.remove);
  const addToCart = useCartStore((state) => state.add);

  const saved = ids.reduce<Product[]>((acc, id) => {
    const product = productById(id);
    if (product) acc.push(product);
    return acc;
  }, []);

  function moveToCart(product: Product) {
    addToCart(product.id, {
      size: product.sizes?.find((option) => option.available)?.value,
      color: product.colors?.[0]?.value,
    });
    removeSaved(product.id);
  }

  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Wishlist' }]} />

      <header className="mt-5">
        <h1 className="text-h1">Wishlist</h1>
        <p className="text-small mt-2 text-muted-foreground">
          {hydrated
            ? `${saved.length} ${saved.length === 1 ? 'product' : 'products'} saved`
            : 'Loading your saved products...'}
        </p>
      </header>

      {!hydrated ? (
        <ProductGridSkeleton count={4} className="mt-10" />
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
                disabled={!product.inStock}
                onClick={() => moveToCart(product)}
              >
                <ShoppingBag className="size-4" data-icon="inline-start" />
                <span className="truncate">
                  {product.inStock ? 'Move to cart' : 'Out of stock'}
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
