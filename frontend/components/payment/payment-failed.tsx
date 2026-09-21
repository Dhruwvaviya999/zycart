'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { CircleAlert, Info, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type PaymentFailureKind = 'cancelled' | 'failed' | 'unfulfillable';

/**
 * Copy for the three ways paying can not work out.
 *
 * Each says plainly whether money was taken, because that is the first thing
 * anyone wants to know and the one thing a vague message leaves them worrying
 * about. None of them says the order was confirmed, and none of them is written
 * to alarm.
 */
const CONTENT: Record<
  PaymentFailureKind,
  { title: string; body: string; reassurance: string; tone: 'neutral' | 'warning' }
> = {
  cancelled: {
    title: 'Payment cancelled',
    body: 'You closed the payment window, so your order has not been completed.',
    reassurance: 'Nothing has been charged and your cart is exactly as you left it.',
    tone: 'neutral',
  },
  failed: {
    title: 'Payment unsuccessful',
    body: 'We couldn’t complete your payment, so your order has not been placed.',
    reassurance: 'Your cart is safe. If your bank shows a debit, it will be reversed.',
    tone: 'warning',
  },
  unfulfillable: {
    title: 'We couldn’t complete this order',
    body: 'Your payment went through, but one of the items sold out before we could confirm it.',
    reassurance: 'We have started a full refund to your original payment method.',
    tone: 'warning',
  },
};

/**
 * A polished, honest failure.
 *
 * Takes focus when it appears so a keyboard or screen-reader user lands on the
 * explanation instead of being left wherever the Razorpay window was, and is an
 * assertive live region because the customer needs to know now.
 */
export function PaymentFailed({
  kind,
  detail,
  onRetry,
  retrying = false,
}: {
  kind: PaymentFailureKind;
  detail?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const content = CONTENT[kind];
  const heading = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [kind]);

  const Icon = content.tone === 'warning' ? CircleAlert : Info;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mt-4 rounded-2xl border border-sale/30 bg-sale/5 p-5"
    >
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-sale" aria-hidden />

        <div className="min-w-0">
          <p
            ref={heading}
            tabIndex={-1}
            className="text-small font-semibold text-sale outline-none"
          >
            {content.title}
          </p>

          <p className="text-caption mt-1.5 text-pretty text-foreground">{content.body}</p>
          <p className="text-caption mt-1 text-pretty text-muted-foreground">
            {content.reassurance}
          </p>

          {detail && (
            <p className="text-caption mt-2 text-pretty text-muted-foreground">{detail}</p>
          )}

          {/* Full-height CTA targets rather than the compact buttons used for
              incidental actions: these two are how someone recovers from a
              failed payment, and they are often pressed on a phone. */}
          <div className="mt-4 flex flex-wrap gap-2">
            {onRetry && (
              <Button size="cta" variant="brand" onClick={onRetry} disabled={retrying}>
                <RotateCcw className="size-4" data-icon="inline-start" aria-hidden />
                {retrying ? 'Starting…' : 'Try payment again'}
              </Button>
            )}

            <Button size="cta" variant="outline" render={<Link href="/cart" />}>
              Return to cart
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
