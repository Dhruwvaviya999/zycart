import type { CartLine, ProductSummary } from '@/types/product';

/**
 * The delivery rule, as the cart page estimates it.
 *
 * Must match `FREE_SHIPPING_THRESHOLD` and `STANDARD_SHIPPING_FEE` in the
 * backend's `config/commerce.ts`. The cart uses these only to preview; checkout
 * reads the server's own `shippingPolicy` and the server prices the order, so a
 * drift here would show a wrong estimate but could never charge a wrong amount.
 */
export const FREE_SHIPPING_THRESHOLD = 999;
export const SHIPPING_FEE = 99;

export interface ResolvedCartLine {
  line: CartLine;
  product: ProductSummary;
}

/**
 * Totals are always computed from the products the API just returned, never
 * from anything stored in the browser — a stale local price must not be able
 * to change what the shopper is shown.
 */
export function buildCartSummary(lines: CartLine[], products: Map<string, ProductSummary>) {
  const items = lines.reduce<ResolvedCartLine[]>((acc, line) => {
    const product = products.get(line.productId);
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
