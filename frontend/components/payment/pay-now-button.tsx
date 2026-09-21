'use client';

import { useRouter } from 'next/navigation';
import { CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthError } from '@/components/auth/auth-error';
import { PaymentFailed, type PaymentFailureKind } from '@/components/payment/payment-failed';
import { PaymentProcessing } from '@/components/payment/payment-processing';
import { useRazorpayPayment } from '@/hooks/use-razorpay-payment';
import { useCartStore } from '@/store/cart-store';
import { formatPrice } from '@/lib/format';

/**
 * Pays for an order that already exists.
 *
 * Shown on the order page for an unpaid online order — after a failed payment,
 * or after the customer simply closed the window. It pays the *same* order
 * rather than creating another, which is the whole reason the local order is
 * the source of truth and the gateway order is not.
 *
 * Whether this is offered at all is the server's decision, carried on the order
 * as `canPayNow`; this component never works it out for itself.
 */
export function PayNowButton({ orderId, total }: { orderId: string; total: number }) {
  const router = useRouter();
  const refreshCart = useCartStore((state) => state.refresh);
  const payment = useRazorpayPayment();

  async function start() {
    if (payment.busy) return;

    const result = await payment.pay(orderId);

    if (result.kind === 'success' || result.kind === 'pending' || result.kind === 'unfulfillable') {
      // The server may have cleared the purchased cart lines; re-read the page
      // from the server so status, payment and timeline are all authoritative.
      await refreshCart();
      router.refresh();
    }
  }

  const failure: PaymentFailureKind | null =
    payment.attempt?.kind === 'cancelled'
      ? 'cancelled'
      : payment.attempt?.kind === 'failed'
        ? 'failed'
        : payment.attempt?.kind === 'unfulfillable'
          ? 'unfulfillable'
          : null;

  return (
    <div>
      <Button size="cta" variant="brand" onClick={start} disabled={payment.busy} className="w-full">
        {payment.busy ? (
          <>
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
            {payment.phase === 'payment-open' ? 'Waiting for payment…' : 'Just a moment…'}
          </>
        ) : (
          <>
            <CreditCard className="size-4" data-icon="inline-start" aria-hidden />
            Pay {formatPrice(total)}
          </>
        )}
      </Button>

      <PaymentProcessing phase={payment.phase} />

      {failure && (
        <PaymentFailed
          kind={failure}
          detail={payment.attempt?.kind === 'failed' ? payment.attempt.message : undefined}
          onRetry={failure === 'unfulfillable' ? undefined : start}
          retrying={payment.busy}
        />
      )}

      {payment.attempt?.kind === 'error' && (
        <div className="mt-4">
          <AuthError message={payment.attempt.message} />
        </div>
      )}
    </div>
  );
}
