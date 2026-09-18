import type { Metadata } from 'next';
import { CartClient } from '@/components/cart/cart-client';

export const metadata: Metadata = {
  title: 'Cart',
  description: 'Review the items in your ZyCart bag before checkout.',
};

export default function CartPage() {
  return <CartClient />;
}
