'use client';

import { useEffect } from 'react';
import { useCartStore } from '@/store/cart-store';
import { useWishlistStore } from '@/store/wishlist-store';

/**
 * Both persisted stores are created with `skipHydration`, because zustand reads
 * localStorage synchronously at module scope — which would give the first client
 * render a full cart while the server rendered an empty one. Rehydrating from an
 * effect keeps that first render identical on both sides; every consumer gates
 * its output on the store's `hydrated` flag until this has run.
 */
export function StoreHydrator() {
  useEffect(() => {
    void useCartStore.persist.rehydrate();
    void useWishlistStore.persist.rehydrate();
  }, []);

  return null;
}
