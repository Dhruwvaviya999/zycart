'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { EmptyState } from '@/components/common/empty-state';
import { ProductGridSkeleton } from '@/components/common/loading-state';
import { Container } from '@/components/layout/container';
import { Price } from '@/components/product/price';
import { Rating } from '@/components/product/rating';
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
        <ul className="mt-10 grid gap-x-4 gap-y-8 sm:grid-cols-2 sm:gap-x-5 lg:grid-cols-3 xl:grid-cols-4">
          {saved.map((product) => (
            <li key={product.id} className="flex flex-col">
              <Link
                href={`/products/${product.slug}`}
                className="focus-ring relative block aspect-4/5 overflow-hidden rounded-2xl bg-surface ring-1 ring-border/70"
              >
                {product.images[0] && (
                  <Image
                    src={product.images[0].url}
                    alt={product.images[0].alt}
                    fill
                    sizes="(min-width: 1280px) 22vw, (min-width: 640px) 45vw, 92vw"
                    className="object-cover"
                  />
                )}
              </Link>

              <div className="flex flex-1 flex-col gap-1.5 pt-3.5">
                <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">
                  {product.brand}
                </p>
                <h2 className="text-small leading-snug font-medium">
                  <Link href={`/products/${product.slug}`} className="focus-ring rounded-sm">
                    {product.name}
                  </Link>
                </h2>
                <Rating value={product.rating} reviewCount={product.reviewCount} />
                <Price price={product.price} compareAtPrice={product.compareAtPrice} />
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  size="cta"
                  variant="brand"
                  className="flex-1"
                  disabled={!product.inStock}
                  onClick={() => {
                    addToCart(product.id, {
                      size: product.sizes?.find((option) => option.available)?.value,
                      color: product.colors?.[0]?.value,
                    });
                    removeSaved(product.id);
                  }}
                >
                  <ShoppingBag className="size-4" data-icon="inline-start" />
                  {product.inStock ? 'Move to cart' : 'Out of stock'}
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
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
