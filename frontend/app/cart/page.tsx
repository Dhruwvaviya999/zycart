import type { Metadata } from 'next';
import { CartClient } from '@/components/cart/cart-client';

/**
 * Read from MongoDB on every request: nothing is prerendered at build time,
 * so `next build` never needs a running API.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cart',
  description: 'Review the items in your ZyCart bag before checkout.',
};

export default function CartPage() {
  return <CartClient />;
}
