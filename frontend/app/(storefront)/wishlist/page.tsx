import type { Metadata } from 'next';
import { WishlistClient } from '@/components/wishlist/wishlist-client';

/**
 * Read from MongoDB on every request: nothing is prerendered at build time,
 * so `next build` never needs a running API.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Wishlist',
  description: 'Products you have saved on ZyCart.',
};

export default function WishlistPage() {
  return <WishlistClient />;
}
