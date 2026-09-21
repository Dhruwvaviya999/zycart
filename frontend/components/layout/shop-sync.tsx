'use client';

import { useEffect, useState } from 'react';
import { useCartStore } from '@/store/cart-store';
import { useWishlistStore } from '@/store/wishlist-store';
import type { AuthUser } from '@/types/user';

/**
 * Keeps the cart and wishlist pointed at the right source.
 *
 * Both stores persist with `skipHydration`, so local storage is read here in an
 * effect rather than at module scope: the server and the first client render
 * must agree on an empty store. Only once that has happened is the mode set,
 * which is what triggers the initial load — guest lines get priced by the
 * server, an account reads its stored cart.
 */
export function ShopSync({ user }: { user: AuthUser | null }) {
  const [rehydrated, setRehydrated] = useState(false);

  useEffect(() => {
    void Promise.all([useCartStore.persist.rehydrate(), useWishlistStore.persist.rehydrate()]).then(
      () => setRehydrated(true),
    );
  }, []);

  const userId = user?.id;

  useEffect(() => {
    if (!rehydrated) return;

    const mode = userId ? 'account' : 'guest';
    void useCartStore.getState().setMode(mode);
    void useWishlistStore.getState().setMode(mode);
  }, [rehydrated, userId]);

  return null;
}
