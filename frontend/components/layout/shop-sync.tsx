'use client';

import { useEffect, useState } from 'react';
import { adoptSessionShoppingState } from '@/lib/session-handoff';
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
 *
 * A signed-in visitor goes through the hand-off rather than straight to the
 * account, so anything saved while signed out is folded in. This is the one
 * place it happens, whichever way the sign-in arrived — Clerk's form on this
 * page, or a full-page return from Google — and with nothing saved locally it
 * is just the switch to the account. A merge that failed last time is simply
 * offered again here.
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

    if (userId) {
      void adoptSessionShoppingState();
      return;
    }

    void useCartStore.getState().setMode('guest');
    void useWishlistStore.getState().setMode('guest');
  }, [rehydrated, userId]);

  return null;
}
