/** How available a cart line is right now, decided by the server. */
export type CartAvailability = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unavailable';

export interface CartItemProduct {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  brand: string;
  category: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
}

export interface CartItem {
  /** A stored line's id, or the composite key the guest preview assigns. */
  id: string;
  quantity: number;
  selectedColor: string | null;
  selectedSize: string | null;
  addedAt: string;
  availability: CartAvailability;
  /** The most that can be ordered right now: stock, capped by the line limit. */
  maxQuantity: number;
  lineTotal: number;
  /** Null once the product has been deleted or deactivated. */
  product: CartItemProduct | null;
}

export interface Cart {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  savings: number;
  /** Things worth telling the customer, such as a quantity clamped to stock. */
  notices: string[];
}

/**
 * What a guest cart persists: identifiers and quantity only.
 *
 * Prices, names and stock are deliberately absent — they are read from the API
 * on every load, so a stale browser can never quote an old price.
 */
export interface GuestCartLine {
  productId: string;
  quantity: number;
  selectedColor?: string | null;
  selectedSize?: string | null;
}

export interface AddToCartInput {
  productId: string;
  quantity?: number;
  selectedColor?: string | null;
  selectedSize?: string | null;
}

export const EMPTY_CART: Cart = {
  items: [],
  itemCount: 0,
  subtotal: 0,
  savings: 0,
  notices: [],
};

/**
 * Identifies a line by product plus chosen variant, matching the server's own
 * key so guest lines and resolved items line up.
 */
export const cartLineKey = (
  productId: string,
  color?: string | null,
  size?: string | null,
): string => `${productId}::${color ?? ''}::${size ?? ''}`;
