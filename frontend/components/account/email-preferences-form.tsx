'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toErrorMessage } from '@/services/api';
import { updateEmailPreferences } from '@/services/user.service';
import type { EmailPreferences } from '@/types/user';

/**
 * The optional emails a customer can switch off.
 *
 * One today: the cart reminder. Order confirmations, shipping notices, refunds
 * and password resets are listed as always-on rather than hidden, so nobody
 * wonders whether turning something off here could cost them a receipt.
 *
 * Saved as soon as it is toggled — a single switch does not need a Save button
 * — and put back if the server refuses, so the switch never shows a state the
 * account is not in.
 */
export function EmailPreferencesForm({ initial }: { initial: EmailPreferences }) {
  const [cartReminders, setCartReminders] = useState(initial.cartReminders);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string>();

  async function toggle(next: boolean) {
    setCartReminders(next);
    setStatus('saving');
    setError(undefined);

    try {
      const user = await updateEmailPreferences({ cartReminders: next });
      setCartReminders(user.emailPreferences.cartReminders);
      setStatus('saved');
    } catch (cause) {
      setCartReminders(!next);
      setError(toErrorMessage(cause));
      setStatus('idle');
    }
  }

  return (
    <div className="max-w-md space-y-3">
      <label className="focus-within:ring-ring/45 flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-border px-5 py-4 focus-within:ring-[3px]">
        <span className="min-w-0">
          <span className="text-small block font-medium">Cart reminders</span>
          <span className="text-caption mt-0.5 block text-muted-foreground">
            One email when your cart has been left for a few hours, at most once per change.
          </span>
        </span>
        <input
          type="checkbox"
          checked={cartReminders}
          onChange={(event) => void toggle(event.target.checked)}
          disabled={status === 'saving'}
          className="mt-0.5 size-4 shrink-0 accent-brand"
        />
      </label>

      <div className="flex items-start justify-between gap-4 rounded-2xl border border-dashed border-border px-5 py-4">
        <span className="min-w-0">
          <span className="text-small block font-medium">Order and account emails</span>
          <span className="text-caption mt-0.5 block text-muted-foreground">
            Confirmations, shipping and delivery updates, refunds and password resets. Always on,
            because they are about something you did.
          </span>
        </span>
      </div>

      <p aria-live="polite" className="text-caption min-h-4">
        {status === 'saving' && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Saving…
          </span>
        )}
        {status === 'saved' && (
          <span className="inline-flex items-center gap-1.5 font-medium text-success">
            <Check className="size-3.5" aria-hidden />
            Saved
          </span>
        )}
        {error && <span className="font-medium text-destructive">{error}</span>}
      </p>
    </div>
  );
}
