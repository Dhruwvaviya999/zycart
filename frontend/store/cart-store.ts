import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { productById } from '@/data/products';
import type { CartLine, Product } from '@/types/product';

const FREE_SHIPPING_THRESHOLD = 999;
const SHIPPING_FEE = 99;
const MAX_QUANTITY = 10;

interface CartState {
  lines: CartLine[];
  savedForLater: CartLine[];
  /** False until persisted state is read, so the server and client agree on first paint. */
  hydrated: boolean;
  setHydrated: () => void;
  add: (productId: string, options?: { size?: string; color?: string; quantity?: number }) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  saveForLater: (productId: string) => void;
  moveToCart: (productId: string) => void;
  removeSaved: (productId: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      savedForLater: [],
      hydrated: false,

      setHydrated: () => set({ hydrated: true }),

      add: (productId, options = {}) =>
        set((state) => {
          const quantity = options.quantity ?? 1;
          const existing = state.lines.find((line) => line.productId === productId);

          if (existing) {
            return {
              lines: state.lines.map((line) =>
                line.productId === productId
                  ? { ...line, quantity: Math.min(line.quantity + quantity, MAX_QUANTITY) }
                  : line,
              ),
            };
          }

          return {
            lines: [
              ...state.lines,
              { productId, quantity, size: options.size, color: options.color },
            ],
          };
        }),

      remove: (productId) =>
        set((state) => ({ lines: state.lines.filter((line) => line.productId !== productId) })),

      setQuantity: (productId, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((line) => line.productId !== productId)
              : state.lines.map((line) =>
                  line.productId === productId
                    ? { ...line, quantity: Math.min(quantity, MAX_QUANTITY) }
                    : line,
                ),
        })),

      saveForLater: (productId) =>
        set((state) => {
          const line = state.lines.find((entry) => entry.productId === productId);
          if (!line) return state;
          return {
            lines: state.lines.filter((entry) => entry.productId !== productId),
            savedForLater: [...state.savedForLater, line],
          };
        }),

      moveToCart: (productId) =>
        set((state) => {
          const line = state.savedForLater.find((entry) => entry.productId === productId);
          if (!line) return state;
          return {
            savedForLater: state.savedForLater.filter((entry) => entry.productId !== productId),
            lines: [...state.lines, line],
          };
        }),

      removeSaved: (productId) =>
        set((state) => ({
          savedForLater: state.savedForLater.filter((entry) => entry.productId !== productId),
        })),

      clear: () => set({ lines: [], savedForLater: [] }),
    }),
    {
      name: 'zycart-cart',
      partialize: ({ lines, savedForLater }) => ({ lines, savedForLater }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
      // Rehydrated from an effect by <StoreHydrator/>, not at module init:
      // the server and the first client render must agree on an empty store.
      skipHydration: true,
    },
  ),
);

export interface ResolvedCartLine {
  line: CartLine;
  product: Product;
}

/** Resolves cart lines against the catalogue and computes the order summary. */
export function selectCartSummary(lines: CartLine[]) {
  const items = lines.reduce<ResolvedCartLine[]>((acc, line) => {
    const product = productById(line.productId);
    if (product) acc.push({ line, product });
    return acc;
  }, []);

  const subtotal = items.reduce((sum, { line, product }) => sum + product.price * line.quantity, 0);

  const savings = items.reduce(
    (sum, { line, product }) =>
      sum + (product.compareAtPrice ? (product.compareAtPrice - product.price) * line.quantity : 0),
    0,
  );

  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;

  return {
    items,
    itemCount: items.reduce((sum, { line }) => sum + line.quantity, 0),
    subtotal,
    savings,
    shipping,
    total: subtotal + shipping,
    freeShippingRemaining: Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal),
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
  };
}
