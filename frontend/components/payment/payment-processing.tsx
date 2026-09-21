'use client';

import { Loader2 } from 'lucide-react';
import type { CheckoutPhase } from '@/types/payment';

/** What the customer is told at each point where they are waiting on us. */
const MESSAGE: Partial<Record<CheckoutPhase, { title: string; body: string }>> = {
  'placing-order': {
    title: 'Preparing your order',
    body: 'One moment while we reserve the details of your order.',
  },
  'creating-payment': {
    title: 'Opening secure payment',
    body: 'We are setting up your payment with Razorpay.',
  },
  'payment-open': {
    title: 'Complete your payment',
    body: 'Finish paying in the Razorpay window. This page will update on its own.',
  },
  'verifying-payment': {
    title: 'Confirming your payment',
    body: 'Please don’t close this page or place the order again.',
  },
  confirming: {
    title: 'Confirming your payment',
    body: 'This is taking a little longer than usual. Please don’t place the order again.',
  },
};

/**
 * The waiting state.
 *
 * Deliberately an inline panel rather than a full-page blank or an overlay that
 * hides the order: a customer who has just entered card details should still be
 * able to see what they are paying for. It is a live region, so the message is
 * announced when it changes rather than only appearing on screen.
 */
export function PaymentProcessing({ phase }: { phase: CheckoutPhase }) {
  const message = MESSAGE[phase];
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-4 flex gap-3 rounded-2xl border border-brand/30 bg-brand-subtle/20 p-4"
    >
      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brand" aria-hidden />

      <div className="min-w-0">
        <p className="text-small font-semibold">{message.title}</p>
        <p className="text-caption mt-1 text-pretty text-muted-foreground">{message.body}</p>
      </div>
    </div>
  );
}
