'use client';

import { useEffect } from 'react';
import { Container } from '@/components/layout/container';
import { ErrorState } from '@/components/common/error-state';

export default function Error({
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
      <ErrorState onRetry={reset} />
    </Container>
  );
}
