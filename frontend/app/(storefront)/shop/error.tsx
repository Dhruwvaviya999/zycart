'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Container } from '@/components/layout/container';

export default function ShopError({
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
    <Container className="py-16">
      <ErrorState
        title="We could not load the catalogue."
        body="The products did not come back this time. Try again — if it keeps happening, it is worth telling us."
        onRetry={reset}
      />
    </Container>
  );
}
