import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toErrorMessage } from '@/services/api';
import { getProductsByIds } from '@/services/product.service';
import * as wishlistApi from '@/services/wishlist.service';
import { EMPTY_WISHLIST, type Wishlist, type WishlistItem } from '@/types/wishlist';
import type { ShopMode } from '@/store/cart-store';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface WishlistState {
  /** Guests persist product ids and nothing else. */
  guestIds: string[];
  hydrated: boolean;

  mode: ShopMode;
  wishlist: Wishlist;
  status: Status;
  error?: string;
  /** Products with a save/remove in flight, so their hearts can lock. */
  pendingProductIds: string[];

  setHydrated: () => void;
  setMode: (mode: ShopMode) => Promise<void>;
  refresh: () => Promise<void>;
  toggle: (productId: string) => Promise<void>;
  /** Idempotent save, for flows that must never un-save by accident. */
  save: (productId: string) => Promise<void>;
  removeByItemId: (itemId: string) => Promise<void>;
  mergeGuestWishlist: () => Promise<{ merged: boolean; error?: string }>;
  resetSession: () => void;
}

/** Guest saves resolve through the catalogue into the same item shape. */
async function resolveGuestWishlist(ids: string[]): Promise<Wishlist> {
  if (ids.length === 0) return EMPTY_WISHLIST;

  const products = await getProductsByIds(ids);
  const byId = new Map(products.map((product) => [product.id, product]));

  // Kept in the order they were saved, and an id the catalogue no longer knows
  // is reported as unavailable rather than quietly dropped.
  const items: WishlistItem[] = ids.map((id) => ({
    id,
    addedAt: new Date().toISOString(),
    available: byId.has(id),
    product: byId.get(id) ?? null,
  }));

  return { items, itemCount: items.length };
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      guestIds: [],
      hydrated: false,
      mode: 'guest',
      wishlist: EMPTY_WISHLIST,
      status: 'idle',
      pendingProductIds: [],

      setHydrated: () => set({ hydrated: true }),

      setMode: async (mode) => {
        if (get().mode === mode && get().status !== 'idle') return;
        set({ mode });
        await get().refresh();
      },

      refresh: async () => {
        const { mode, guestIds } = get();
        set({ status: 'loading', error: undefined });

        try {
          const wishlist =
            mode === 'account'
              ? await wishlistApi.getWishlist()
              : await resolveGuestWishlist(guestIds);

          set({ wishlist, status: 'ready' });
        } catch (error) {
          set({ status: 'error', error: toErrorMessage(error) });
        }
      },

      /**
       * One entry point for the heart on every product card. The saved state is
       * derived from the resolved list, so the icon and the wishlist page can
       * never disagree.
       */
      toggle: async (productId) => {
        const { mode, wishlist, pendingProductIds } = get();
        if (pendingProductIds.includes(productId)) return;

        const saved = wishlist.items.find((item) => item.product?.id === productId);

        set({ pendingProductIds: [...pendingProductIds, productId], error: undefined });

        try {
          if (mode === 'account') {
            const next = saved
              ? await wishlistApi.removeWishlistItem(saved.id)
              : await wishlistApi.addToWishlist(productId);

            set({ wishlist: next, status: 'ready' });
          } else {
            const guestIds = saved
              ? get().guestIds.filter((id) => id !== productId)
              : [productId, ...get().guestIds];

            set({ guestIds });
            set({ wishlist: await resolveGuestWishlist(guestIds), status: 'ready' });
          }
        } catch (error) {
          set({ error: toErrorMessage(error) });
        } finally {
          set((state) => ({
            pendingProductIds: state.pendingProductIds.filter((id) => id !== productId),
          }));
        }
      },

      /**
       * Saves without the toggle's second meaning.
       *
       * "Save for later" on the cart moves an item into the wishlist and then
       * drops it from the bag — using `toggle` there would un-save anything
       * already saved and then remove it from the cart, losing it from both.
       */
      save: async (productId) => {
        const { wishlist, toggle } = get();
        if (wishlist.items.some((item) => item.product?.id === productId)) return;

        await toggle(productId);
      },

      /** Removal from the wishlist page, which addresses items by their own id. */
      removeByItemId: async (itemId) => {
        const { mode, wishlist } = get();
        const item = wishlist.items.find((entry) => entry.id === itemId);
        const productId = item?.product?.id ?? itemId;

        set((state) => ({
          pendingProductIds: [...state.pendingProductIds, productId],
          error: undefined,
        }));

        try {
          if (mode === 'account') {
            set({ wishlist: await wishlistApi.removeWishlistItem(itemId), status: 'ready' });
          } else {
            const guestIds = get().guestIds.filter((id) => id !== itemId);
            set({ guestIds });
            set({ wishlist: await resolveGuestWishlist(guestIds), status: 'ready' });
          }
        } catch (error) {
          set({ error: toErrorMessage(error) });
        } finally {
          set((state) => ({
            pendingProductIds: state.pendingProductIds.filter((id) => id !== productId),
          }));
        }
      },

      /**
       * Carries guest saves into the account at sign-in.
       *
       * Adds are idempotent server-side, so a partial retry cannot duplicate.
       * The local ids are only dropped once every one has landed — a failure
       * leaves them in place rather than losing what the visitor saved.
       */
      mergeGuestWishlist: async () => {
        const { guestIds } = get();
        if (guestIds.length === 0) return { merged: false };

        try {
          let wishlist = await wishlistApi.getWishlist();

          for (const productId of [...guestIds].reverse()) {
            wishlist = await wishlistApi.addToWishlist(productId);
          }

          set({ guestIds: [], wishlist, mode: 'account', status: 'ready' });
          return { merged: true };
        } catch (error) {
          return { merged: false, error: toErrorMessage(error) };
        }
      },

      /** The signed-in wishlist must not linger for whoever browses next. */
      resetSession: () =>
        set({
          mode: 'guest',
          wishlist: EMPTY_WISHLIST,
          status: 'idle',
          pendingProductIds: [],
          error: undefined,
        }),
    }),
    {
      name: 'zycart-wishlist',
      partialize: ({ guestIds }) => ({ guestIds }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
      skipHydration: true,
    },
  ),
);

/** True when this product is saved, whichever mode is active. */
export function useIsWishlisted(productId: string): boolean {
  return useWishlistStore((state) =>
    state.wishlist.items.some((item) => item.product?.id === productId),
  );
}
