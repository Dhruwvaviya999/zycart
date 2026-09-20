/**
 * What happens after the sale.
 *
 * Three lifecycles live here, and they are kept apart from `types/order.ts` for
 * the same reason the backend keeps them in separate collections: an order's
 * status, a parcel's status and a return's status answer different questions,
 * and a single file of statuses invites rendering one where another was meant.
 *
 * Every label in this file is *presentation*. The enums are the server's, and
 * nothing here ever decides eligibility, transitions or amounts — those arrive
 * already decided, because the browser is not where the rules live.
 */

/* ---------------------------------------------------------------- */
/* Shipment                                                          */
/* ---------------------------------------------------------------- */

export type ShipmentStatus =
  | 'READY_TO_SHIP'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'EXCEPTION'
  | 'CANCELLED';

export interface ShipmentEvent {
  status: ShipmentStatus;
  at: string;
  note: string;
  actorName: string;
}

export interface Shipment {
  id: string;
  status: ShipmentStatus;
  carrier: string;
  trackingNumber: string;
  /** Always absolute https, or empty. Validated by the server before storage. */
  trackingUrl: string;
  /** Null until it actually happened. The UI renders the absence, never a guess. */
  shippedAt: string | null;
  deliveredAt: string | null;
  estimatedDeliveryAt: string | null;
  note: string;
  events: ShipmentEvent[];
  createdAt: string;
  updatedAt: string;
}

/**
 * What a customer is told a shipment status means.
 *
 * Deliberately not the enum value. "OUT_FOR_DELIVERY" is an internal name, and
 * a shopper reading their order page should see "Out for delivery today" — a
 * sentence about their parcel, not a token from a database.
 */
export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  READY_TO_SHIP: 'Getting ready to ship',
  SHIPPED: 'Shipped',
  IN_TRANSIT: 'On the way',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  EXCEPTION: 'Delivery problem',
  CANCELLED: 'Shipment cancelled',
};

/** The operator's vocabulary, which is allowed to be the technical one. */
export const SHIPMENT_ADMIN_LABEL: Record<ShipmentStatus, string> = {
  READY_TO_SHIP: 'Ready to ship',
  SHIPPED: 'Shipped',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  EXCEPTION: 'Exception',
  CANCELLED: 'Cancelled',
};

/**
 * Carriers offered as suggestions in the console.
 *
 * Suggestions, not a constraint — the field is free text on the server too,
 * because the first parcel that goes out with a local courier has to be
 * recordable. These are the ones a ZyCart operator types most often.
 */
export const CARRIER_SUGGESTIONS = [
  'Delhivery',
  'Blue Dart',
  'DTDC',
  'Ecom Express',
  'India Post',
  'Shadowfax',
  'XpressBees',
];

/* ---------------------------------------------------------------- */
/* Returns                                                           */
/* ---------------------------------------------------------------- */

export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RECEIVED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'CANCELLED';

export const RETURN_STATUSES: ReturnStatus[] = [
  'REQUESTED',
  'APPROVED',
  'RECEIVED',
  'REFUND_PENDING',
  'REFUNDED',
  'REJECTED',
  'CANCELLED',
];

export type ReturnReason =
  | 'WRONG_ITEM'
  | 'DAMAGED'
  | 'DEFECTIVE'
  | 'SIZE_ISSUE'
  | 'NOT_AS_EXPECTED'
  | 'CHANGED_MIND'
  | 'OTHER';

/**
 * How each reason is offered to the customer.
 *
 * `label` is what they pick; `hint` is the one line that disambiguates it, so
 * "Damaged" and "Faulty" are not a coin toss. The order matters: the reasons
 * that are ZyCart's fault come first, because a customer with a broken parcel
 * should not have to scroll past "changed my mind" to say so.
 */
export const RETURN_REASON_OPTIONS: { value: ReturnReason; label: string; hint: string }[] = [
  { value: 'DAMAGED', label: 'Arrived damaged', hint: 'It was broken or marked when it arrived.' },
  { value: 'DEFECTIVE', label: 'Faulty', hint: 'It arrived intact but does not work properly.' },
  { value: 'WRONG_ITEM', label: 'Wrong item sent', hint: 'This is not what I ordered.' },
  { value: 'SIZE_ISSUE', label: "Size doesn't fit", hint: 'The fit is wrong for me.' },
  {
    value: 'NOT_AS_EXPECTED',
    label: 'Not as described',
    hint: 'It does not match the listing.',
  },
  { value: 'CHANGED_MIND', label: 'Changed my mind', hint: 'I no longer want it.' },
  { value: 'OTHER', label: 'Something else', hint: 'Tell us in the note below.' },
];

export const RETURN_REASON_LABEL: Record<ReturnReason, string> = Object.fromEntries(
  RETURN_REASON_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ReturnReason, string>;

/**
 * What a customer is told a return status means, and what happens next.
 *
 * `next` is the half that matters. A status tells somebody where their request
 * is; it does not tell them whether they should be doing something, and a
 * post-purchase page whose whole job is reassurance has to answer both.
 */
export const RETURN_STATUS_COPY: Record<ReturnStatus, { label: string; next: string }> = {
  REQUESTED: {
    label: 'Under review',
    next: 'Our team is looking at your request. You do not need to do anything yet.',
  },
  APPROVED: {
    label: 'Approved',
    next: 'Send the items back to us. We will check them in when they arrive.',
  },
  REJECTED: {
    label: 'Not approved',
    next: 'This request was declined. The reason is below.',
  },
  RECEIVED: {
    label: 'Items received',
    next: 'We have your items and are sorting out the refund.',
  },
  REFUND_PENDING: {
    label: 'Refund on its way',
    next: 'Your refund has been sent to your bank. It usually lands within 5 to 7 working days.',
  },
  REFUNDED: {
    label: 'Refunded',
    next: 'Your refund has been completed.',
  },
  CANCELLED: {
    label: 'Withdrawn',
    next: 'You withdrew this request. Those items can be returned again if the window is open.',
  },
};

/** The operator's vocabulary for the same states. */
export const RETURN_ADMIN_LABEL: Record<ReturnStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RECEIVED: 'Received',
  REFUND_PENDING: 'Refund pending',
  REFUNDED: 'Refunded',
  CANCELLED: 'Withdrawn',
};

export interface ReturnItem {
  id: string;
  orderItemId: string;
  product: string | null;
  productName: string;
  productImage: string;
  sku: string;
  selectedColor: string | null;
  selectedSize: string | null;
  /** Whole rupees, from the order snapshot. Never the live catalogue price. */
  unitPrice: number;
  purchasedQuantity: number;
  requestedQuantity: number;
  /** Null until reviewed; may be fewer than requested. */
  approvedQuantity: number | null;
  reason: ReturnReason;
}

export interface ReturnRefund {
  amount: number;
  initiatedAt: string | null;
  completedAt: string | null;
  pending: boolean;
}

export interface ReturnRequest {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  status: ReturnStatus;
  items: ReturnItem[];
  itemCount: number;
  customerNote: string;
  /** The operator's explanation, written for the customer. Never the internal note. */
  resolutionNote: string;
  requestedAt: string;
  decidedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  refund: ReturnRefund;
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * One return, as its own page loads it.
 *
 * Separate from `ReturnRequest` because the extra field costs an indexed
 * lookup, and the server only pays it on the detail endpoint. Creating or
 * withdrawing a return answers with the plain shape, and this type says so
 * rather than promising a field those responses do not carry.
 */
export interface ReturnRequestDetail extends ReturnRequest {
  /**
   * When ZyCart last successfully emailed this customer about this return, or
   * null.
   *
   * Null covers three situations and the page says the same thing in all of
   * them — nothing: there was nothing worth emailing about, a message is still
   * waiting to go out, or one failed. Claiming "we've emailed you" for a
   * message a mail server refused is the one thing this field exists to make
   * impossible.
   */
  lastUpdateEmailedAt: string | null;
}

export interface ReturnSummary {
  id: string;
  returnNumber: string;
  orderNumber: string;
  status: ReturnStatus;
  itemCount: number;
  preview: string[];
  refundAmount: number;
  requestedAt: string;
  updatedAt: string;
}

/**
 * The server's verdict on whether this order can be returned.
 *
 * `returnable` and `reason` arrive decided. The browser renders them; it does
 * not recompute them, does not second-guess them and has no copy of the window
 * length or the eligibility rules to drift from.
 */
export interface Returnability {
  returnable: boolean;
  reason: string | null;
  windowEndsAt: string | null;
  windowDays: number;
  lines: {
    orderItemId: string;
    productName: string;
    purchasedQuantity: number;
    returnableQuantity: number;
  }[];
}

/* ---------------------------------------------------------------- */
/* Admin input shapes                                                */
/* ---------------------------------------------------------------- */

/**
 * Creating a parcel.
 *
 * No status: the server derives the initial one from the order, so there is no
 * field here through which the console could ask for a parcel state that
 * contradicts the order it belongs to.
 *
 * `estimatedDeliveryAt` is a date-only string, as `<input type="date">` sends
 * it. The server bounds it ahead and behind, and never computes one — an
 * absent estimate is shown as absent, not filled in with a guess.
 */
export interface ShipmentInput {
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDeliveryAt?: string;
  note?: string;
}

/**
 * Editing a parcel's details.
 *
 * An empty string clears a value; an omitted key leaves it alone. That
 * distinction is what lets an operator correct a tracking number without wiping
 * the estimate they did not mention. The date takes an explicit `null` to
 * clear, because an empty string is not a date.
 */
export interface ShipmentUpdateInput {
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDeliveryAt?: string | null;
  note?: string;
}

/** What the return dialog submits. No prices, no amounts — only what and how many. */
export interface CreateReturnInput {
  items: { orderItemId: string; quantity: number; reason: ReturnReason }[];
  note?: string;
}
