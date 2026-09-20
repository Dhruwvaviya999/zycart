import { SHIPMENT_LABEL } from '@/types/fulfillment';
import { ORDER_PROGRESSION, type Order, type OrderStatus } from '@/types/order';

/**
 * The order's story, assembled from things that actually happened.
 *
 * ## The one rule
 *
 * **No step ever carries a time that was not recorded.** Not `createdAt`
 * standing in for a dispatch date, not "probably about then", not a plausible
 * interpolation between two known points. A step either has the timestamp the
 * server stored for it, or it has none and says so.
 *
 * That sounds obvious and it is the easiest thing in a post-purchase interface
 * to get wrong, because a timeline with a gap looks broken and a timeline with
 * invented dates looks finished. The gap is the honest one. An order that
 * shipped before ZyCart recorded dispatch times shows "Shipped — date not
 * recorded", and a customer reading it learns something true.
 *
 * ## Three kinds of step
 *
 * - `done` — it happened. `at` is the recorded moment, or null when the fact is
 *   known but the moment is not.
 * - `current` — where the order is now. Exactly one step is ever current, and
 *   only when the order is still in motion.
 * - `expected` — it has not happened. Never given a date, because a date on an
 *   unhappened step is a promise, and ZyCart has no carrier integration to back
 *   one. The single exception is the delivery estimate a person typed in, which
 *   is shown as an estimate and labelled as one.
 *
 * ## Why it is a pure function in `lib`
 *
 * Everything here is derivation from a payload, with no rendering and no
 * browser. That makes the rule above assertable: a test can hand it an order
 * with no shipment and check that nothing came out with a fabricated date.
 */

export type TimelineState = 'done' | 'current' | 'expected';

export interface TimelineStep {
  key: string;
  label: string;
  /** ISO, or null when the fact is known and the moment is not. */
  at: string | null;
  state: TimelineState;
  /** One extra line, where there is something true to add. */
  detail?: string;
}

/** Steps beyond dispatch that a parcel-less order still needs to show. */
const FALLBACK_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'PROCESSING', label: 'Being prepared' },
  { status: 'SHIPPED', label: 'Shipped' },
  { status: 'DELIVERED', label: 'Delivered' },
];

export function buildOrderTimeline(order: Order): TimelineStep[] {
  const steps: TimelineStep[] = [
    {
      key: 'placed',
      label: 'Order placed',
      at: order.createdAt,
      state: 'done',
    },
  ];

  /* Payment ------------------------------------------------------- */

  if (order.payment.paidAt) {
    steps.push({
      key: 'paid',
      label: 'Payment confirmed',
      at: order.payment.paidAt,
      state: 'done',
    });
  } else if (order.payment.method === 'COD') {
    /**
     * Cash on delivery, which ZyCart never sees change hands.
     *
     * Before the parcel arrives this is a genuine upcoming step, and saying so
     * is useful — it is how the order was always going to be paid, not a
     * failure or a delay.
     *
     * Once the order is delivered it is omitted entirely. The courier collected
     * the cash, but nothing in ZyCart witnessed that, so there is no timestamp
     * to show and no honest way to mark it done. Leaving it as "not yet" on a
     * delivered order would be worse than either: it would tell a customer who
     * has already paid the driver that they still owe money. The payment panel
     * beside the timeline carries the state for anyone who wants it.
     */
    if (order.status !== 'DELIVERED') {
      steps.push({
        key: 'paid',
        label: 'Pay on delivery',
        at: null,
        state: 'expected',
        detail: 'Payable in cash when your order arrives.',
      });
    }
  } else if (order.status !== 'CANCELLED') {
    steps.push({ key: 'paid', label: 'Payment confirmed', at: null, state: 'expected' });
  }

  /* Cancellation ends the story --------------------------------- */

  if (order.status === 'CANCELLED') {
    steps.push({
      key: 'cancelled',
      label: 'Order cancelled',
      at: order.cancelledAt,
      state: 'done',
      detail: order.cancellationReason ?? undefined,
    });

    return steps;
  }

  /* Fulfilment ---------------------------------------------------- */

  const shipment = order.shipment;

  if (shipment && shipment.events.length > 0) {
    /**
     * The parcel's own history, which is the richest honest source there is:
     * every entry was written at the moment an operator recorded that step.
     *
     * Rendered in full rather than deduplicated, so a failed delivery attempt
     * followed by a successful one reads as what happened rather than as a
     * tidy fiction with the attempt removed.
     */
    shipment.events.forEach((event, index) => {
      const last = index === shipment.events.length - 1;

      steps.push({
        key: `shipment-${String(index)}`,
        label: SHIPMENT_LABEL[event.status],
        at: event.at,
        state: last && event.status !== 'DELIVERED' ? 'current' : 'done',
        detail: event.note || undefined,
      });
    });

    if (shipment.status !== 'DELIVERED' && shipment.status !== 'CANCELLED') {
      steps.push({
        key: 'delivered',
        label: 'Delivered',
        at: null,
        state: 'expected',
        // The only forward-looking date in this file, and it exists because a
        // person entered it. Absent, it says so rather than guessing.
        detail: shipment.estimatedDeliveryAt
          ? undefined
          : 'Estimated delivery date not available yet.',
      });
    }

    return steps;
  }

  /**
   * No parcel on record.
   *
   * Every order placed before Phase 13 is here, and so is every order that has
   * not been packed yet. What is still known is the order's own status, so the
   * steps it has passed are shown as reached — with their dates left blank,
   * because nothing recorded them. `DELIVERED` is the exception: that one does
   * have a stored timestamp now, when it was set after Phase 13 landed.
   */
  const reached = ORDER_PROGRESSION.indexOf(order.status);

  for (const step of FALLBACK_STEPS) {
    const index = ORDER_PROGRESSION.indexOf(step.status);
    const passed = index <= reached;
    const at = step.status === 'DELIVERED' ? order.deliveredAt : null;

    steps.push({
      key: step.status.toLowerCase(),
      label: step.label,
      at,
      state: passed ? (index === reached ? 'current' : 'done') : 'expected',
      detail: passed && !at ? 'Date not recorded' : undefined,
    });
  }

  return steps;
}
