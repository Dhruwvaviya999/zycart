'use client';

import { useEffect } from 'react';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { ErrorState } from '@/components/common/error-state';
import { Container } from '@/components/layout/container';

export default function CartError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Cart' }]} />

      <header className="mt-5">
        <h1 className="text-h1">Your cart</h1>
      </header>

      <ErrorState
        title="We could not load your cart."
        body="Your items are safe — this is a display problem on our side. Try again, and nothing will have been lost."
        onRetry={reset}
        secondaryAction={{ label: 'Keep shopping', href: '/shop' }}
        className="mt-10"
      />
    </Container>
  );
}
