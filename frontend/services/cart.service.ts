import { request, send } from '@/services/api';
import type { AddToCartInput, Cart, GuestCartLine } from '@/types/cart';

export function getCart(): Promise<Cart> {
  return request<Cart>('/api/cart');
}

/**
 * Resolves guest lines against live products without storing anything.
 *
 * This is why a signed-out shopper sees the same prices, stock and availability
 * as a signed-in one: both carts are priced by the same server code.
 */
export function previewCart(items: GuestCartLine[]): Promise<Cart> {
  return send<Cart>('post', '/api/cart/preview', { items });
}

export function addToCart(input: AddToCartInput): Promise<Cart> {
  return send<Cart>('post', '/api/cart/items', {
    productId: input.productId,
    quantity: input.quantity ?? 1,
    selectedColor: input.selectedColor ?? null,
    selectedSize: input.selectedSize ?? null,
  });
}

export function updateCartItem(itemId: string, quantity: number): Promise<Cart> {
  return send<Cart>('patch', `/api/cart/items/${itemId}`, { quantity });
}

export function removeCartItem(itemId: string): Promise<Cart> {
  return send<Cart>('delete', `/api/cart/items/${itemId}`);
}

export function clearCart(): Promise<Cart> {
  return send<Cart>('delete', '/api/cart');
}

/** Folds the guest cart into the signed-in one. Additive; never overwrites. */
export function mergeGuestCart(items: GuestCartLine[]): Promise<Cart> {
  return send<Cart>('post', '/api/cart/merge', { items });
}
