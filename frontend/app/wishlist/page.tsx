import type { Metadata } from 'next';
import { WishlistClient } from '@/components/wishlist/wishlist-client';

export const metadata: Metadata = {
  title: 'Wishlist',
  description: 'Products you have saved on ZyCart.',
};

export default function WishlistPage() {
  return <WishlistClient />;
}
