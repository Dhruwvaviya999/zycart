import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WishlistState {
  ids: string[];
  hydrated: boolean;
  setHydrated: () => void;
  toggle: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set) => ({
      ids: [],
      hydrated: false,

      setHydrated: () => set({ hydrated: true }),

      toggle: (productId) =>
        set((state) => ({
          ids: state.ids.includes(productId)
            ? state.ids.filter((id) => id !== productId)
            : [productId, ...state.ids],
        })),

      remove: (productId) => set((state) => ({ ids: state.ids.filter((id) => id !== productId) })),

      clear: () => set({ ids: [] }),
    }),
    {
      name: 'zycart-wishlist',
      partialize: ({ ids }) => ({ ids }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
