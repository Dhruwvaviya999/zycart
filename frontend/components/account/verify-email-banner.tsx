'use client';

import { useState } from 'react';
import { Loader2, MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toErrorMessage } from '@/services/api';
import { resendVerification } from '@/services/auth.service';

/**
 * A quiet prompt to verify the account's email address.
 *
 * Nothing is blocked without verification — accounts created before Phase 18
 * are unverified, and refusing them checkout overnight would be worse than the
 * problem it solves. The banner exists because order updates, receipts and
 * password resets all go to this address, and a typo in it is found out the
 * day one of those does not arrive.
 *
 * "Send again" answers in the server's words, which are deliberately calm
 * inside the cooldown: the previous link still works.
 */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);

  async function resend() {
    if (busy) return;

    setBusy(true);
    setMessage(null);

    try {
      setMessage({ text: await resendVerification(), failed: false });
    } catch (cause) {
      setMessage({ text: toErrorMessage(cause), failed: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-brand/25 bg-brand-subtle/30 px-4 py-3.5 sm:items-center">
      <MailWarning className="mt-0.5 size-4 shrink-0 text-brand sm:mt-0" aria-hidden />

      <p className="text-small min-w-0 flex-1 text-pretty">
        <span className="font-semibold">Confirm your email address.</span>{' '}
        <span className="text-muted-foreground">
          We sent a link to <span className="font-medium text-foreground">{email}</span> so order
          updates reach the right inbox.
        </span>
      </p>

      <Button size="sm" variant="outline" onClick={() => void resend()} disabled={busy}>
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : 'Send again'}
      </Button>

      {message && (
        <p
          role={message.failed ? 'alert' : 'status'}
          className={
            message.failed
              ? 'text-caption w-full font-medium text-destructive'
              : 'text-caption w-full text-muted-foreground'
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
