import { useCartStore } from '@/store/cart-store';
import { useWishlistStore } from '@/store/wishlist-store';

export interface HandoffResult {
  /** Shown to the customer when something they had saved did not carry over. */
  warning?: string;
}

/**
 * Carries a visitor's shopping state into the account they just signed in to.
 *
 * Both merges are additive and neither clears its local copy until the server
 * has confirmed. If one fails the local state is left untouched and the caller
 * is given something to say, so signing in can never quietly cost someone their
 * cart. Whatever happens, the stores end up reading from the account.
 */
export async function adoptSessionShoppingState(): Promise<HandoffResult> {
  const cart = useCartStore.getState();
  const wishlist = useWishlistStore.getState();

  const [cartResult, wishlistResult] = await Promise.all([
    cart.mergeGuestCart(),
    wishlist.mergeGuestWishlist(),
  ]);

  // Switch to the account regardless: the session is real either way, and a
  // preserved guest cart is merged again on the next attempt.
  await Promise.all([cart.setMode('account'), wishlist.setMode('account')]);

  if (cartResult.error && wishlistResult.error) {
    return {
      warning:
        'We could not move your saved bag and wishlist across. They are still here — try again in a moment.',
    };
  }
  if (cartResult.error) {
    return {
      warning: 'We could not move your bag across. Nothing was lost — try again in a moment.',
    };
  }
  if (wishlistResult.error) {
    return {
      warning:
        'We could not move your saved products across. Nothing was lost — try again in a moment.',
    };
  }

  return {};
}

/** Drops account shopping state so it is never shown to whoever browses next. */
export function clearSessionShoppingState(): void {
  useCartStore.getState().resetSession();
  useWishlistStore.getState().resetSession();
}
