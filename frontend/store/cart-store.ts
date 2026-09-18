import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toErrorMessage } from '@/services/api';
import * as cartApi from '@/services/cart.service';
import {
  cartLineKey,
  EMPTY_CART,
  type AddToCartInput,
  type Cart,
  type GuestCartLine,
} from '@/types/cart';

export type ShopMode = 'guest' | 'account';
type Status = 'idle' | 'loading' | 'ready' | 'error';

interface CartState {
  /**
   * The only thing written to local storage, and only identifiers and
   * quantities — never a price, a name or a stock level.
   */
  guestLines: GuestCartLine[];
  hydrated: boolean;

  mode: ShopMode;
  cart: Cart;
  status: Status;
  error?: string;
  /** Lines with a write in flight, so their controls can lock individually. */
  pendingIds: string[];

  setHydrated: () => void;
  setMode: (mode: ShopMode) => Promise<void>;
  refresh: () => Promise<void>;
  add: (input: AddToCartInput) => Promise<void>;
  setQuantity: (itemId: string, quantity: number) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  clear: () => Promise<void>;
  mergeGuestCart: () => Promise<{ merged: boolean; error?: string }>;
  resetSession: () => void;
}

/** Totals after a local guest edit. Summation only — availability stays server-decided. */
function recalculate(cart: Cart): Cart {
  const payable = cart.items.filter(
    (item) =>
      item.product && item.availability !== 'out_of_stock' && item.availability !== 'unavailable',
  );

  return {
    ...cart,
    itemCount: payable.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: payable.reduce((sum, item) => sum + item.lineTotal, 0),
    savings: payable.reduce((sum, item) => {
      const compareAt = item.product?.compareAtPrice ?? 0;
      const price = item.product?.price ?? 0;
      return compareAt > price ? sum + (compareAt - price) * item.quantity : sum;
    }, 0),
  };
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => {
      const markPending = (id: string, pending: boolean) =>
        set((state) => ({
          pendingIds: pending
            ? [...state.pendingIds, id]
            : state.pendingIds.filter((entry) => entry !== id),
        }));

      /** Runs a signed-in write, keeping the line locked until it settles. */
      const accountWrite = async (id: string, action: () => Promise<Cart>) => {
        markPending(id, true);
        try {
          set({ cart: await action(), status: 'ready', error: undefined });
        } catch (error) {
          set({ error: toErrorMessage(error) });
        } finally {
          markPending(id, false);
        }
      };

      return {
        guestLines: [],
        hydrated: false,
        mode: 'guest',
        cart: EMPTY_CART,
        status: 'idle',
        pendingIds: [],

        setHydrated: () => set({ hydrated: true }),

        setMode: async (mode) => {
          if (get().mode === mode && get().status !== 'idle') return;
          set({ mode });
          await get().refresh();
        },

        refresh: async () => {
          const { mode, guestLines } = get();
          set({ status: 'loading', error: undefined });

          try {
            if (mode === 'account') {
              set({ cart: await cartApi.getCart(), status: 'ready' });
              return;
            }

            if (guestLines.length === 0) {
              set({ cart: EMPTY_CART, status: 'ready' });
              return;
            }

            set({ cart: await cartApi.previewCart(guestLines), status: 'ready' });
          } catch (error) {
            set({ status: 'error', error: toErrorMessage(error) });
          }
        },

        add: async (input) => {
          if (get().mode === 'account') {
            set({ error: undefined });
            try {
              set({ cart: await cartApi.addToCart(input), status: 'ready' });
            } catch (error) {
              set({ error: toErrorMessage(error) });
              throw error;
            }
            return;
          }

          // Guest: fold into the matching line exactly as the server would, then
          // let the preview re-price the whole cart authoritatively.
          const key = cartLineKey(input.productId, input.selectedColor, input.selectedSize);
          const quantity = input.quantity ?? 1;

          set((state) => {
            const existing = state.guestLines.find(
              (line) => cartLineKey(line.productId, line.selectedColor, line.selectedSize) === key,
            );

            return {
              guestLines: existing
                ? state.guestLines.map((line) =>
                    line === existing
                      ? { ...line, quantity: Math.min(line.quantity + quantity, 10) }
                      : line,
                  )
                : [
                    ...state.guestLines,
                    {
                      productId: input.productId,
                      quantity,
                      selectedColor: input.selectedColor ?? null,
                      selectedSize: input.selectedSize ?? null,
                    },
                  ],
            };
          });

          await get().refresh();
        },

        setQuantity: async (itemId, quantity) => {
          if (get().mode === 'account') {
            await accountWrite(itemId, () => cartApi.updateCartItem(itemId, quantity));
            return;
          }

          /**
           * Guests get the change immediately. The arithmetic uses the price the
           * server sent with this cart moments ago — nothing is read back out of
           * local storage — and the next load re-resolves everything anyway.
           */
          set((state) => {
            const item = state.cart.items.find((entry) => entry.id === itemId);
            if (!item?.product) return state;

            const next = Math.max(1, Math.min(quantity, item.maxQuantity || 1));

            return {
              guestLines: state.guestLines.map((line) =>
                cartLineKey(line.productId, line.selectedColor, line.selectedSize) === itemId
                  ? { ...line, quantity: next }
                  : line,
              ),
              cart: recalculate({
                ...state.cart,
                items: state.cart.items.map((entry) =>
                  entry.id === itemId
                    ? { ...entry, quantity: next, lineTotal: (entry.product?.price ?? 0) * next }
                    : entry,
                ),
              }),
            };
          });
        },

        remove: async (itemId) => {
          if (get().mode === 'account') {
            await accountWrite(itemId, () => cartApi.removeCartItem(itemId));
            return;
          }

          set((state) => ({
            guestLines: state.guestLines.filter(
              (line) =>
                cartLineKey(line.productId, line.selectedColor, line.selectedSize) !== itemId,
            ),
            cart: recalculate({
              ...state.cart,
              items: state.cart.items.filter((entry) => entry.id !== itemId),
            }),
          }));
        },

        clear: async () => {
          if (get().mode === 'account') {
            try {
              set({ cart: await cartApi.clearCart(), status: 'ready', error: undefined });
            } catch (error) {
              set({ error: toErrorMessage(error) });
            }
            return;
          }

          set({ guestLines: [], cart: EMPTY_CART, status: 'ready' });
        },

        /**
         * Hands the guest cart over at sign-in.
         *
         * The local cart is only cleared once the server has confirmed the
         * merge. If it fails, the guest lines are left exactly where they were
         * and the caller is told, so a failed merge costs the customer nothing.
         */
        mergeGuestCart: async () => {
          const { guestLines } = get();
          if (guestLines.length === 0) return { merged: false };

          try {
            const cart = await cartApi.mergeGuestCart(guestLines);
            set({ guestLines: [], cart, mode: 'account', status: 'ready', error: undefined });
            return { merged: true };
          } catch (error) {
            return { merged: false, error: toErrorMessage(error) };
          }
        },

        /**
         * Signing out drops the account cart from client state so it can never be
         * shown to whoever uses the browser next. The stored cart stays with the
         * account in MongoDB.
         */
        resetSession: () =>
          set({
            mode: 'guest',
            cart: EMPTY_CART,
            status: 'idle',
            pendingIds: [],
            error: undefined,
          }),
      };
    },
    {
      name: 'zycart-cart',
      // Identifiers and quantities only.
      partialize: ({ guestLines }) => ({ guestLines }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
      skipHydration: true,
    },
  ),
);

/** Total units, not distinct lines — what the navbar badge shows. */
export const selectCartCount = (state: CartState): number => state.cart.itemCount;
