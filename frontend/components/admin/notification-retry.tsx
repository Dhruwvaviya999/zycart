'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthError } from '@/components/auth/auth-error';
import { retryNotification } from '@/services/admin.service';
import { toErrorMessage } from '@/services/api';
import type { NotificationDetail } from '@/types/admin';

/**
 * Sending one failed message again.
 *
 * ## Whether the button appears is the server's call
 *
 * `canRetry` and `retryBlockedReason` come from the same check the retry
 * endpoint performs before it claims the row. This component renders what they
 * say and decides nothing — so a message the provider has already accepted
 * never shows a Retry button, and the reason is shown instead.
 *
 * ## The result is what actually happened
 *
 * A retry that succeeds says so. A retry that fails says the delivery is still
 * failed and can be tried later, because that is true — and because a console
 * that reported "sent" for a message a mail server refused would make every
 * other "Sent" on this screen worthless. Both messages come from the server,
 * which is the only party that knows.
 */
export function NotificationRetry({ delivery }: { delivery: NotificationDetail }) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [outcome, setOutcome] = useState<{ sent: boolean; message: string }>();

  async function run() {
    if (busy) return;

    setBusy(true);
    setError(undefined);
    setOutcome(undefined);

    try {
      const result = await retryNotification(delivery.id);
      setOutcome({ sent: result.sent, message: result.message });
      // Re-reads the page from the server rather than patching state here: the
      // attempt count, the status and the failure reason all changed, and all
      // of them should come back from the source.
      router.refresh();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AuthError message={error} />

      {outcome && !error && (
        <p
          role="status"
          className={`text-caption mb-3 text-pretty ${
            outcome.sent ? 'text-muted-foreground' : 'text-destructive'
          }`}
        >
          {outcome.sent && (
            <CheckCircle2 className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
          )}
          {outcome.message}
        </p>
      )}

      {delivery.canRetry ? (
        <>
          <Button
            size="cta"
            variant="brand"
            onClick={() => void run()}
            disabled={busy}
            className="w-full"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
            ) : (
              <Send className="size-4" data-icon="inline-start" aria-hidden />
            )}
            {busy ? 'Sending…' : 'Retry email'}
          </Button>

          {/*
            Said plainly rather than left for an operator to discover. A
            permanent failure is usually an address the provider refused, and
            pressing this again will produce the same refusal — the honest
            thing is to say so before the click, not after.
          */}
          {delivery.failureKind === 'PERMANENT' && (
            <p className="text-caption mt-2 text-pretty text-muted-foreground">
              The last attempt failed for a reason a retry is unlikely to fix. Check the address on
              the customer&rsquo;s account first.
            </p>
          )}

          {delivery.staleSending && (
            <p className="text-caption mt-2 text-pretty text-muted-foreground">
              A previous attempt started and never finished. It may or may not have been accepted,
              so retrying could send a second copy.
            </p>
          )}

          <p className="text-caption mt-2 text-pretty text-muted-foreground">
            This only sends the message again. It does not change the order, the return, the refund
            or stock.
          </p>
        </>
      ) : (
        <p className="text-caption text-pretty text-muted-foreground">
          {delivery.retryBlockedReason}
        </p>
      )}
    </div>
  );
}
