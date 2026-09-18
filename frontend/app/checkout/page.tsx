import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Container } from '@/components/layout/container';
import { CheckoutClient } from '@/components/checkout/checkout-client';
import { getSessionCookie, getSessionUser } from '@/lib/server-auth';
import { getCheckoutSummary } from '@/services/order.service';
import { toErrorMessage } from '@/services/api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Review and place your ZyCart order.',
};

export default async function CheckoutPage() {
  // Belt and braces alongside the proxy: this is the check that actually
  // verifies the session rather than merely noticing a cookie.
  const user = await getSessionUser();
  if (!user) redirect('/login?redirect=/checkout');

  let summary;
  try {
    summary = await getCheckoutSummary(undefined, { cookie: await getSessionCookie() });
  } catch (error) {
    return (
      <Container className="py-8 sm:py-10">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Checkout' }]} />
        <h1 className="text-h1 mt-5">Checkout</h1>
        <ErrorState
          title="We could not load your checkout."
          body={toErrorMessage(error)}
          secondaryAction={{ label: 'Back to cart', href: '/cart' }}
          className="mt-8"
        />
      </Container>
    );
  }

  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Cart', href: '/cart' },
          { label: 'Checkout' },
        ]}
      />

      <header className="mt-5">
        <h1 className="text-h1">Checkout</h1>
        <p className="text-small mt-2 text-muted-foreground">
          {summary.items.length > 0
            ? 'Confirm where this is going and how you would like to pay.'
            : 'There is nothing to check out yet.'}
        </p>
      </header>

      {summary.items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty."
          body="Add something you love before checking out — whatever you add will appear here."
          action={{ label: 'Continue shopping', href: '/shop' }}
          className="mt-10"
        />
      ) : (
        <CheckoutClient summary={summary} />
      )}

      <p className="text-caption mt-10 text-center text-muted-foreground">
        Changed your mind?{' '}
        <Link href="/shop" className="focus-ring rounded-sm font-medium text-brand hover:underline">
          Keep shopping
        </Link>
      </p>
    </Container>
  );
}
