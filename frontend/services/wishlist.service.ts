import { request, send } from '@/services/api';
import type { Cart } from '@/types/cart';
import type { Wishlist } from '@/types/wishlist';

export function getWishlist(): Promise<Wishlist> {
  return request<Wishlist>('/api/wishlist');
}

export function addToWishlist(productId: string): Promise<Wishlist> {
  return send<Wishlist>('post', '/api/wishlist/items', { productId });
}

export function removeWishlistItem(itemId: string): Promise<Wishlist> {
  return send<Wishlist>('delete', `/api/wishlist/items/${itemId}`);
}

export function clearWishlist(): Promise<Wishlist> {
  return send<Wishlist>('delete', '/api/wishlist');
}

export interface MoveToCartInput {
  quantity?: number;
  selectedColor?: string | null;
  selectedSize?: string | null;
}

/** Answers with both lists, so the client never has to guess the resulting state. */
export function moveWishlistItemToCart(
  itemId: string,
  input: MoveToCartInput = {},
): Promise<{ cart: Cart; wishlist: Wishlist }> {
  return send<{ cart: Cart; wishlist: Wishlist }>(
    'post',
    `/api/wishlist/items/${itemId}/move-to-cart`,
    {
      quantity: input.quantity ?? 1,
      selectedColor: input.selectedColor ?? null,
      selectedSize: input.selectedSize ?? null,
    },
  );
}
