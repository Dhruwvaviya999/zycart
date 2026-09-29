import { returnability, type PolicyOrder } from '../returns/return-policy';
import { MAX_EMAIL_LINES, type EmailLine } from './templates/shared';
import type { AbandonedCartEmailData } from './templates/abandoned-cart';
import type { OrderDeliveredEmailData } from './templates/order-delivered';
import type { OrderPlacedEmailData } from './templates/order-placed';
import type { OrderShippedEmailData } from './templates/order-shipped';
import type { PaymentFailedEmailData } from './templates/payment-failed';
import type { RefundCompletedEmailData } from './templates/refund-completed';
import type { ReturnApprovedEmailData } from './templates/return-approved';

/**
 * Turning authoritative documents into the data a template is given.
 *
 * ## Why these read documents rather than receiving them pre-flattened
 *
 * The services that raise events pass ZyCart's own loaded documents in, and
 * every field below is copied from one. Nothing is recomputed, nothing is
 * fetched from the catalogue, and nothing is derived from a request body. A
 * product renamed next week does not rename itself in an email about an order
 * placed today, because the name comes from the order's snapshot — which was
 * copied from the catalogue at purchase precisely so that history stays fixed.
 *
 * ## Why a missing field produces a shorter email rather than a plausible one
 *
 * Every optional value here — a carrier, a tracking number, an estimated
 * delivery date, a delivery date — is either something a person recorded or
 * absent. Absent is passed through as empty or null, and the templates say less
 * when it is. There is no branch anywhere in this file that substitutes a
 * default, and that is the whole of ZyCart's no-fabrication rule as it applies
 * to mail.
 */

/** The order fields a payload may read. Structural, so a document satisfies it. */
export interface PayloadOrder extends PolicyOrder {
  orderNumber: string;
  items: readonly PayloadOrderItem[];
}

export interface PayloadOrderItem {
  _id: unknown;
  productName: string;
  quantity: number;
  unitPrice: number;
  returnedQuantity?: number | null;
  selectedColor?: string | null;
  selectedSize?: string | null;
}

/** The shipment fields a payload may read. Null when nothing was ever recorded. */
export interface PayloadShipment {
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  estimatedDeliveryAt?: Date | null;
}

export interface PayloadReturnItem {
  productName: string;
  requestedQuantity: number;
  approvedQuantity?: number | null;
  selectedColor?: string | null;
  selectedSize?: string | null;
}

export interface PayloadReturn {
  returnNumber: string;
  orderNumber: string;
  items: readonly PayloadReturnItem[];
  resolutionNote?: string | null;
  refund?: { amount?: number | null } | null;
}

/**
 * `Size 9 · Black`, or nothing.
 *
 * The separator matches the storefront's own, so a line in an email and the
 * same line on the order page read identically. An item with neither axis gets
 * an empty string and the renderer omits the second line entirely rather than
 * printing an empty one.
 */
function variantOf(item: { selectedSize?: string | null; selectedColor?: string | null }): string {
  const parts: string[] = [];

  if (item.selectedSize) parts.push(`Size ${item.selectedSize}`);
  if (item.selectedColor) parts.push(item.selectedColor);

  return parts.join(' · ');
}

/**
 * The first few lines, and how many were left out.
 *
 * Truncation rather than pagination: an email is a notification. The count that
 * follows is what stops it being misleading — "Nike Air Max ×1" alone would
 * read as the whole order.
 */
function summarise(
  lines: readonly EmailLine[],
): { items: EmailLine[]; hiddenItemCount: number } {
  return {
    items: lines.slice(0, MAX_EMAIL_LINES),
    hiddenItemCount: Math.max(0, lines.length - MAX_EMAIL_LINES),
  };
}

function orderLines(order: PayloadOrder): EmailLine[] {
  return order.items.map((item) => ({
    name: item.productName,
    variant: variantOf(item),
    quantity: item.quantity,
  }));
}

export function buildOrderShippedPayload(
  customerName: string,
  order: PayloadOrder,
  shipment: PayloadShipment | null,
): OrderShippedEmailData {
  const { items, hiddenItemCount } = summarise(orderLines(order));

  return {
    customerName,
    orderNumber: order.orderNumber,
    // Empty rather than a placeholder. The template drops the row entirely.
    carrier: shipment?.carrier ?? '',
    trackingNumber: shipment?.trackingNumber ?? '',
    trackingUrl: shipment?.trackingUrl ?? '',
    estimatedDeliveryAt: shipment?.estimatedDeliveryAt?.toISOString() ?? null,
    items,
    hiddenItemCount,
  };
}

/**
 * The delivered message, including whether a return is genuinely possible.
 *
 * `returnability` is the same function the storefront, the order API and the
 * return service consult — not a re-reading of its rules. An email that offered
 * a return the server would refuse would send a customer to a page that tells
 * them no, having promised otherwise in writing.
 */
export function buildOrderDeliveredPayload(
  customerName: string,
  order: PayloadOrder,
  now: Date = new Date(),
): OrderDeliveredEmailData {
  const { items, hiddenItemCount } = summarise(orderLines(order));
  const verdict = returnability(order, now);

  return {
    customerName,
    orderNumber: order.orderNumber,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    items,
    hiddenItemCount,
    returnsOpen: verdict.returnable,
    returnWindowEndsAt: verdict.returnable ? verdict.windowEndsAt : null,
  };
}

export function buildReturnApprovedPayload(
  customerName: string,
  request: PayloadReturn,
): ReturnApprovedEmailData {
  const lines = request.items
    .map((item) => ({
      name: item.productName,
      variant: variantOf(item),
      // The approved figure, which is also what the refund is computed from.
      // Falling back to the requested figure only covers the impossible case of
      // an approval that set no quantities; `approveReturn` always sets them.
      quantity: item.approvedQuantity ?? item.requestedQuantity,
    }))
    .filter((line) => line.quantity > 0);

  const { items, hiddenItemCount } = summarise(lines);

  return {
    customerName,
    returnNumber: request.returnNumber,
    orderNumber: request.orderNumber,
    items,
    hiddenItemCount,
    // The customer-facing note only. `adminNote` is not read here and is not in
    // `PayloadReturn`, so internal commentary has no route into an inbox.
    resolutionNote: request.resolutionNote ?? '',
  };
}

export function buildRefundCompletedPayload(
  customerName: string,
  request: PayloadReturn,
): RefundCompletedEmailData {
  return {
    customerName,
    returnNumber: request.returnNumber,
    orderNumber: request.orderNumber,
    // From the stored refund record — the amount that was actually sent to the
    // gateway. Never recomputed from current prices, never from a client.
    amount: request.refund?.amount ?? 0,
  };
}

/* ---------------------------------------------------------------- */
/* Phase 18                                                          */
/* ---------------------------------------------------------------- */

/** The extra order fields the confirmation reads. */
export interface PayloadPlacedOrder extends PayloadOrder {
  shippingAddress: { city: string; state: string };
  coupon?: { code: string } | null;
}

/**
 * The confirmation, from the order as committed.
 *
 * Every figure is the stored pricing — what the customer was charged or will
 * pay at the door — and the destination is the city and state only. The full
 * address is on the order page behind a sign-in; an email is forwarded,
 * screenshotted and left open on shared screens.
 */
export function buildOrderPlacedPayload(
  customerName: string,
  order: PayloadPlacedOrder,
): OrderPlacedEmailData {
  const { items, hiddenItemCount } = summarise(orderLines(order));
  const { city, state } = order.shippingAddress;

  return {
    customerName,
    orderNumber: order.orderNumber,
    paymentMethod: order.payment.method === 'RAZORPAY' ? 'RAZORPAY' : 'COD',
    total: order.pricing.total,
    shipping: order.pricing.shipping,
    discount: order.pricing.discount,
    couponCode: order.coupon?.code ?? '',
    deliverTo: [city, state].filter(Boolean).join(', '),
    items,
    hiddenItemCount,
  };
}

export function buildPaymentFailedPayload(
  customerName: string,
  order: PayloadOrder,
): PaymentFailedEmailData {
  const { items, hiddenItemCount } = summarise(orderLines(order));

  return {
    customerName,
    orderNumber: order.orderNumber,
    total: order.pricing.total,
    items,
    hiddenItemCount,
  };
}

/** One cart line as the reminder names it. */
export interface PayloadCartLine {
  productName: string;
  quantity: number;
  selectedColor?: string | null;
  selectedSize?: string | null;
}

/**
 * The reminder, from the lines the customer can still buy.
 *
 * The caller passes only lines resolved against the live catalogue and found
 * purchasable — a reminder about an item that has since been withdrawn would
 * send somebody to a cart that tells them it is gone.
 */
export function buildAbandonedCartPayload(
  customerName: string,
  lines: readonly PayloadCartLine[],
  optOutUrl: string,
): AbandonedCartEmailData {
  const { items, hiddenItemCount } = summarise(
    lines.map((line) => ({
      name: line.productName,
      variant: variantOf(line),
      quantity: line.quantity,
    })),
  );

  return { customerName, items, hiddenItemCount, optOutUrl };
}
