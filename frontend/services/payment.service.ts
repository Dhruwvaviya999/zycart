import { send, request, type RequestOptions } from '@/services/api';
import type {
  PaymentResult,
  PaymentStatusResult,
  PaymentVerificationPayload,
  RazorpayOrderData,
} from '@/types/payment';

/**
 * Every call the browser makes about money.
 *
 * Note what none of these send: an amount, a total, a currency or a user id.
 * A payment is addressed by order reference and confirmed with the identifiers
 * Razorpay issued; the server decides everything else.
 */

/**
 * Opens a Razorpay Checkout session for an order the customer already owns.
 *
 * Safe to call twice: the server reuses the gateway order while it is still
 * open, so a double click gets the same session rather than a second one.
 */
export function createRazorpayOrder(orderId: string): Promise<RazorpayOrderData> {
  return send<RazorpayOrderData>('post', '/api/payments/razorpay/create', { orderId });
}

/**
 * Hands Razorpay's callback to the server to be verified.
 *
 * The resolved value is the server's verdict, not this call succeeding. A
 * resolved promise with `paid: false` is a real outcome — authorised but not
 * captured, or refunded because the items sold out — and the interface has to
 * read `paid` rather than assume.
 */
export function verifyRazorpayPayment(payload: PaymentVerificationPayload): Promise<PaymentResult> {
  return send<PaymentResult>('post', '/api/payments/razorpay/verify', payload);
}

/**
 * The authoritative payment state for one order.
 *
 * Used by the confirming screen while a payment settles. The server reconciles
 * against Razorpay as part of answering, so this is also what recovers an order
 * whose browser callback never arrived.
 */
export function getPaymentStatus(
  orderRef: string,
  options?: RequestOptions,
): Promise<PaymentStatusResult> {
  return request<PaymentStatusResult>(
    `/api/payments/orders/${encodeURIComponent(orderRef)}/status`,
    undefined,
    options,
  );
}

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

let loader: Promise<void> | null = null;

/**
 * Loads Razorpay Checkout, once, on demand.
 *
 * Deliberately not a `<Script>` in the root layout: a third-party payment
 * bundle has no business loading on the homepage, a product page or anywhere
 * else nobody is paying. It is fetched when a customer actually chooses to pay,
 * and the promise is cached so a retry does not fetch it again.
 */
export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout can only load in the browser'));
  }

  if (window.Razorpay) return Promise.resolve();

  loader ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT}"]`);

    const script = existing ?? document.createElement('script');

    const onLoad = () => (window.Razorpay ? resolve() : fail());
    const fail = () => {
      loader = null;
      reject(new Error('We could not load the payment window. Please check your connection.'));
    };

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', fail, { once: true });

    if (!existing) {
      script.src = CHECKOUT_SCRIPT;
      script.async = true;
      document.body.appendChild(script);
    }
  });

  return loader;
}
