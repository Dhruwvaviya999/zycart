import type { Order } from '@/types/order';

/**
 * Types for the online payment flow.
 *
 * Everything here describes what the *server* says about a payment. Nothing in
 * this file is a decision the browser gets to make: the amount, the status and
 * the outcome all arrive from the API, and the interface renders them.
 */

export type { PaymentMethod, PaymentStatus } from '@/types/order';

/**
 * What the checkout page is doing right now.
 *
 * A single `isLoading` boolean cannot distinguish "creating the gateway order"
 * from "the customer is in Razorpay's window" from "we are confirming the
 * money" — and each of those needs a different message, a different button and
 * a different answer to "can I press this again?".
 */
export type CheckoutPhase =
  | 'idle'
  | 'placing-order'
  | 'creating-payment'
  | 'payment-open'
  | 'verifying-payment'
  | 'confirming'
  | 'success'
  | 'cancelled'
  | 'failed';

/** The minimum the browser needs to open Razorpay Checkout, all server-issued. */
export interface RazorpayOrderData {
  orderId: string;
  orderNumber: string;
  razorpayOrderId: string;
  /** The publishable key id. The key secret never reaches the browser. */
  keyId: string;
  /** Currency subunits, as Razorpay Checkout expects them. */
  amount: number;
  /** The same figure in whole rupees, which is what ZyCart displays. */
  amountInRupees: number;
  currency: string;
  prefill: { name: string; email: string; contact: string };
}

/** Exactly what Razorpay Checkout hands back — identifiers, never amounts. */
export interface PaymentVerificationPayload {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/**
 * The server's verdict on a payment.
 *
 * `FINALIZED` and `ALREADY_FINALIZED` both mean the order is confirmed; the
 * rest each need their own message, and none of them is a success.
 */
export type PaymentOutcome =
  | 'FINALIZED'
  | 'ALREADY_FINALIZED'
  | 'REFUNDED_UNFULFILLABLE'
  | 'AWAITING_CAPTURE'
  | 'PAYMENT_FAILED'
  | 'NOT_PAYABLE';

export interface PaymentResult {
  outcome: PaymentOutcome;
  /** The server's answer to "is this order paid?". The only one that counts. */
  paid: boolean;
  order: Order;
}

export interface PaymentStatusResult {
  order: Order;
  pending: boolean;
}

/* ------------------------------------------------------------------ */
/* Razorpay Checkout's own browser API, typed rather than left as `any`. */

export interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutFailure {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
    metadata?: { order_id?: string; payment_id?: string };
  };
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  handler: (response: RazorpayCheckoutResponse) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  modal?: { ondismiss?: () => void; escape?: boolean; confirm_close?: boolean };
}

export interface RazorpayCheckoutInstance {
  open: () => void;
  close: () => void;
  on: (event: 'payment.failed', handler: (response: RazorpayCheckoutFailure) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }
}
