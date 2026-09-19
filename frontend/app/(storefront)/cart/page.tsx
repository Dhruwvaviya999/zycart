import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CartClient } from '@/components/cart/cart-client';
import { RecommendationSkeleton } from '@/components/recommendations/recommendation-skeleton';
import { RecommendedProducts } from '@/components/recommendations/recommended-products';

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
  return (
    <>
      <CartClient />

      {/*
        Below the cart, deliberately.

        A recommendation rail on a cart page competes with the one thing the
        page exists for, so this sits under the items, the subtotal and the
        checkout button rather than beside them — and it streams separately, so
        it can never delay the cart or the price the customer is about to pay.

        The cart's own contents are not excluded from it: doing so would need
        the cart read twice, once on the server for this rail and once on the
        client where it already lives. The scorer's own "already interacted
        with" penalty pushes those products down for a signed-in customer
        anyway, which gets most of the benefit for none of the duplication.
      */}
      <Suspense fallback={<RecommendationSkeleton count={4} />}>
        <RecommendedProducts
          context="cart"
          limit={4}
          title="You might also like"
          description="Other products from the parts of the catalogue you have been looking at."
        />
      </Suspense>
    </>
  );
}
