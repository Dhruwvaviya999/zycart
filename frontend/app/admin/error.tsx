'use client';

import { useEffect } from 'react';
import { AdminError, AdminPageHeader } from '@/components/admin/admin-ui';

/**
 * The console's own error boundary.
 *
 * The storefront's moved into the `(storefront)` group with the rest of its
 * chrome, so without this an unhandled error in an admin page would escape to
 * Next's default screen — outside the shell, with no navigation back.
 * Recovering here keeps the operator inside the console.
 */
export default function AdminErrorBoundary({
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
    <>
      <AdminPageHeader title="Something went wrong" />
      <AdminError
        message={
          // A digest is all the client gets for a server-side failure, and it
          // is the only thing that ties this screen to a server log.
          error.digest
            ? `${error.message || 'The page could not be loaded.'} (reference ${error.digest})`
            : error.message || 'The page could not be loaded.'
        }
        onRetry={reset}
      />
    </>
  );
}
