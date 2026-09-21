'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthError } from '@/components/auth/auth-error';
import { toErrorMessage } from '@/services/api';
import { cancelReturn } from '@/services/return.service';

/**
 * Withdrawing a return request.
 *
 * ## Why this one does not ask twice
 *
 * Cancelling an *order* opens a confirmation dialog, because it restores stock
 * and cannot be undone. Withdrawing a return is neither: the units go straight
 * back to the returnable pool, and the customer can raise the request again
 * while the window is open. A modal here would be ceremony over a reversible
 * action, and the sentence above the button already says what happens.
 *
 * The button is only rendered when the server said `canCancel`, so it never
 * leads to a refusal — and the server checks the transition again anyway, which
 * is what makes two clicks produce one withdrawal and one clear message.
 */
export function CancelReturnButton({ returnNumber }: { returnNumber: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function withdraw() {
    if (busy) return;

    setBusy(true);
    setError(undefined);

    try {
      await cancelReturn(returnNumber);
      // Re-reads the page from the server, so the status, the timeline and the
      // order's returnable quantities are all refreshed from what was written.
      router.refresh();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AuthError message={error} />

      <Button
        size="cta"
        variant="outline"
        onClick={withdraw}
        disabled={busy}
        className={error ? 'mt-4 w-full' : 'w-full'}
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
            Withdrawing…
          </>
        ) : (
          'Withdraw request'
        )}
      </Button>
    </>
  );
}
