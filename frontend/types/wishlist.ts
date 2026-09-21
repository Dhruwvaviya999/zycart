import type { ProductSummary } from '@/types/product';

export interface WishlistItem {
  id: string;
  addedAt: string;
  /** False once the product has been deleted or deactivated. */
  available: boolean;
  /** The same shape the catalogue returns, so the usual product card renders it. */
  product: ProductSummary | null;
}

export interface Wishlist {
  items: WishlistItem[];
  itemCount: number;
}

export const EMPTY_WISHLIST: Wishlist = { items: [], itemCount: 0 };
