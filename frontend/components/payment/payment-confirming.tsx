'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getPaymentStatus } from '@/services/payment.service';

/** Bounded on purpose: a handful of checks, then it stops and says so. */
const ATTEMPTS = 6;
const INTERVAL_MS = 3000;

/**
 * Waits for a payment to settle, then re-renders the page from the server.
 *
 * Mounted only when the order's stored state says a payment is genuinely still
 * resolving — the browser callback was lost, or Razorpay has authorised but not
 * yet captured. Each check asks the server, which reconciles against Razorpay
 * as part of answering, so this resolves even when the webhook is the only
 * thing that ever learns about the payment.
 *
 * It is not a polling loop in any lasting sense: six checks over about twenty
 * seconds, and then it hands the customer a manual refresh rather than
 * hammering the API forever on an abandoned tab.
 */
export function PaymentConfirming({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const [exhausted, setExhausted] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Guarded so React's development double-invoke does not start two loops.
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const look = async (attempt: number) => {
      if (cancelled) return;

      try {
        const status = await getPaymentStatus(orderNumber);

        if (cancelled) return;

        // Anything other than still-waiting means the page should re-read the
        // authoritative order and render whatever it now says.
        if (!['PENDING', 'AUTHORIZED'].includes(status.order.payment.status)) {
          router.refresh();
          return;
        }
      } catch {
        // A failed check says nothing about the payment; try again.
      }

      if (attempt + 1 >= ATTEMPTS) {
        setExhausted(true);
        return;
      }

      timer = setTimeout(() => void look(attempt + 1), INTERVAL_MS);
    };

    void look(0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderNumber, router]);

  if (exhausted) {
    return (
      <p role="status" className="text-caption mt-4 text-pretty text-muted-foreground">
        This is taking longer than usual. Your payment is still being confirmed with your bank —
        please check this order again shortly.{' '}
        <button
          type="button"
          onClick={() => router.refresh()}
          className="focus-ring rounded-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          Check now
        </button>
      </p>
    );
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="text-caption mt-4 flex items-center justify-center gap-2 text-muted-foreground"
    >
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      Checking with your bank&hellip;
    </p>
  );
}
