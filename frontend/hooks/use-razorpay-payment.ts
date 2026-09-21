'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toErrorMessage } from '@/services/api';
import {
  createRazorpayOrder,
  getPaymentStatus,
  loadRazorpayCheckout,
  verifyRazorpayPayment,
} from '@/services/payment.service';
import type { Order } from '@/types/order';
import type { CheckoutPhase, RazorpayCheckoutResponse } from '@/types/payment';

/**
 * How a payment attempt ended, from the customer's point of view.
 *
 * `success` is only ever set from a server response that said the order is
 * paid. There is no path in this file that infers success from Razorpay's
 * callback alone.
 */
export type PaymentAttempt =
  | { kind: 'success'; order: Order }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message?: string }
  | { kind: 'unfulfillable'; order: Order }
  /** Real money, real uncertainty: taken but not yet confirmed as captured. */
  | { kind: 'pending'; order: Order }
  | { kind: 'error'; message: string };

/** A short, bounded wait — not a polling loop that runs until the tab closes. */
const CONFIRM_ATTEMPTS = 5;
const CONFIRM_INTERVAL_MS = 2500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cross-checks the key id the server issued against the one this build was
 * configured with.
 *
 * The server's value is always the one used — it is the key the gateway order
 * was actually created under, so anything else would simply fail. This exists
 * to catch the deployment mistake where the two halves point at different
 * Razorpay accounts, which otherwise shows up as a baffling Checkout error.
 */
function warnOnKeyMismatch(serverKeyId: string): void {
  const configured = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

  if (configured && configured !== serverKeyId) {
    console.warn(
      '[payment] NEXT_PUBLIC_RAZORPAY_KEY_ID does not match the key id the API issued. ' +
        'The API key is being used. Check that both halves point at the same Razorpay account.',
    );
  }
}

/**
 * Runs one online payment, from gateway order to confirmed ZyCart order.
 *
 * The sequence is deliberately linear and has one guard at the top: `busy`.
 * While a payment is in flight — including while the customer is inside
 * Razorpay's window — `pay()` does nothing, which is what makes a double click,
 * an impatient second press or a stray re-render harmless.
 *
 * The browser's callback is never treated as proof. It is forwarded to the
 * server, and the server's answer decides what the customer is told. If that
 * answer cannot be obtained — the request failed, or the payment is authorised
 * but not yet captured — the result is `pending`, never `success` and never
 * `failed`, because a customer whose card has been charged must not be told
 * their payment did not go through.
 */
export function useRazorpayPayment() {
  const [phase, setPhase] = useState<CheckoutPhase>('idle');
  const [attempt, setAttempt] = useState<PaymentAttempt>();

  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Nothing is set after unmount; the customer may have navigated away. */
  const settle = useCallback((next: CheckoutPhase, result?: PaymentAttempt) => {
    if (!mounted.current) return;
    setPhase(next);
    if (result) setAttempt(result);
  }, []);

  /**
   * Asks the server what actually happened, a few times, then gives up
   * gracefully.
   *
   * Reached when the verify call could not be completed — the customer's
   * connection dropped at the worst possible moment — or when the payment is
   * authorised and waiting on capture. The server reconciles against Razorpay
   * as part of answering, so this also resolves the case where the webhook is
   * the only thing that ever knew about the payment.
   */
  const confirmFromServer = useCallback(
    async (orderRef: string): Promise<PaymentAttempt> => {
      settle('confirming');

      let last: Order | undefined;

      for (let index = 0; index < CONFIRM_ATTEMPTS; index += 1) {
        if (index > 0) await wait(CONFIRM_INTERVAL_MS);
        if (!mounted.current) break;

        try {
          const status = await getPaymentStatus(orderRef);
          last = status.order;

          if (status.order.payment.status === 'PAID') {
            return { kind: 'success', order: status.order };
          }

          if (['REFUND_PENDING', 'REFUNDED'].includes(status.order.payment.status)) {
            return { kind: 'unfulfillable', order: status.order };
          }

          if (status.order.payment.status === 'FAILED') {
            return { kind: 'failed', message: status.order.payment.failureReason ?? undefined };
          }
        } catch {
          // Keep trying: a failed status check says nothing about the payment.
        }
      }

      return last
        ? { kind: 'pending', order: last }
        : {
            kind: 'error',
            message:
              'Your payment could not be confirmed yet. Please check your orders in a moment.',
          };
    },
    [settle],
  );

  const pay = useCallback(
    async (orderId: string): Promise<PaymentAttempt> => {
      if (busy.current) return { kind: 'error', message: 'A payment is already in progress.' };

      busy.current = true;
      setAttempt(undefined);
      settle('creating-payment');

      try {
        // Both server-issued. The amount below is Razorpay's copy of the
        // server's figure; the browser never computes it.
        const session = await createRazorpayOrder(orderId);
        warnOnKeyMismatch(session.keyId);

        await loadRazorpayCheckout();

        if (!window.Razorpay) {
          throw new Error('We could not load the payment window. Please try again.');
        }

        const result = await new Promise<PaymentAttempt>((resolve) => {
          // Razorpay calls exactly one of dismiss / handler / payment.failed in
          // the normal case, but a slow verify can overlap a dismiss, so the
          // first answer wins and the rest are ignored.
          let answered = false;
          const answer = (value: PaymentAttempt) => {
            if (answered) return;
            answered = true;
            resolve(value);
          };

          const checkout = new window.Razorpay!({
            key: session.keyId,
            amount: session.amount,
            currency: session.currency,
            name: 'ZyCart',
            description: `Order ${session.orderNumber}`,
            order_id: session.razorpayOrderId,
            prefill: session.prefill,
            notes: { orderNumber: session.orderNumber },
            theme: { color: '#1f1f1f' },

            handler: (response: RazorpayCheckoutResponse) => {
              settle('verifying-payment');

              verifyRazorpayPayment({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              })
                .then(async (verified) => {
                  if (verified.paid) {
                    answer({ kind: 'success', order: verified.order });
                    return;
                  }

                  if (verified.outcome === 'REFUNDED_UNFULFILLABLE') {
                    answer({ kind: 'unfulfillable', order: verified.order });
                    return;
                  }

                  // AWAITING_CAPTURE and anything else uncertain: money may well
                  // have moved, so ask the server rather than guessing.
                  answer(await confirmFromServer(session.orderNumber));
                })
                .catch(async () => {
                  // The payment may have succeeded and only the confirmation
                  // failed to reach us. Never report this as a failure.
                  answer(await confirmFromServer(session.orderNumber));
                });
            },

            modal: {
              ondismiss: () => answer({ kind: 'cancelled' }),
              confirm_close: true,
            },
          });

          checkout.on('payment.failed', (failure) => {
            answer({
              kind: 'failed',
              message: failure.error?.description,
            });
          });

          settle('payment-open');
          checkout.open();
        });

        const nextPhase: CheckoutPhase =
          result.kind === 'success'
            ? 'success'
            : result.kind === 'cancelled'
              ? 'cancelled'
              : 'failed';

        settle(nextPhase, result);
        return result;
      } catch (error) {
        const result: PaymentAttempt = { kind: 'error', message: toErrorMessage(error) };
        settle('failed', result);
        return result;
      } finally {
        busy.current = false;
      }
    },
    [confirmFromServer, settle],
  );

  const reset = useCallback(() => {
    if (busy.current) return;
    setAttempt(undefined);
    setPhase('idle');
  }, []);

  return {
    phase,
    setPhase,
    attempt,
    pay,
    reset,
    /** True whenever pressing pay again would be wrong. */
    busy: phase !== 'idle' && phase !== 'cancelled' && phase !== 'failed',
  };
}
