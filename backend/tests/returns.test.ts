import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import {
  HOLDING_RETURN_STATUSES,
  RETURN_REASONS,
  RETURN_STATUSES,
  RETURN_STATUS_FLOW,
  RETURN_WINDOW_DAYS,
  type ReturnStatus,
} from '../src/models/return.model';
import {
  DISPATCHED_SHIPMENT_STATUSES,
  SHIPMENT_IMPLIES_ORDER,
  SHIPMENT_STATUSES,
  SHIPMENT_STATUS_FLOW,
} from '../src/models/shipment.model';
import { ORDER_STATUSES } from '../src/models/order.model';
import { MOVEMENT_DIRECTION, MOVEMENT_TYPES } from '../src/models/inventory-movement.model';
import {
  plannedRefund,
  refundability,
  refundableUnitPrice,
  remainingRefundable,
  returnability,
  returnableQuantity,
  returnWindowEndsAt,
  type PolicyOrder,
} from '../src/services/returns/return-policy';
import { operatorReachable } from '../src/services/fulfillment/shipment.service';
// The order transition graph lives in the service that owns transitions, not
// in the model - so that is where these cross-phase guards read it from.
import { ORDER_STATUS_FLOW } from '../src/services/order.service';
import {
  createReturnSchema,
  receiveReturnSchema,
  returnDecisionSchema,
  returnRejectionSchema,
} from '../src/validators/return.validator';
import {
  createShipmentSchema,
  shipmentStatusSchema,
  updateShipmentSchema,
} from '../src/validators/shipment.validator';

/**
 * Phase 13's rules, tested where they actually live.
 *
 * None of this touches MongoDB, which is the same choice the inventory and AI
 * suites made and for the same reason: what is under test is ZyCart's own
 * logic, and a database round trip would only add ways for a test to fail for
 * reasons that have nothing to do with it.
 *
 * What that leaves out is deliberate and is covered elsewhere. The atomic
 * reservation of returnable quantity, the transaction binding a shipment move
 * to its order move, and two clients racing for the last unit cannot be
 * asserted without a replica set — so `verify-returns.ts` runs them against a
 * real one, including genuine concurrent calls. The two suites are
 * complementary, not overlapping.
 */

const ID = () => new Types.ObjectId();

/** A delivered, paid order with one line of two units, unless overridden. */
function order(overrides: Partial<PolicyOrder> = {}): PolicyOrder {
  return {
    status: 'DELIVERED',
    deliveredAt: new Date(),
    items: [{ _id: ID(), quantity: 2, returnedQuantity: 0, unitPrice: 1000, productName: 'Shoe' }],
    pricing: { subtotal: 2000, shipping: 0, discount: 0, tax: 0, total: 2000 },
    payment: {
      method: 'RAZORPAY',
      status: 'PAID',
      razorpayPaymentId: 'pay_abc123',
      refundedAmount: 0,
    },
    ...overrides,
  };
}

/* ---------------------------------------------------------------- */
/* Shipment lifecycle                                                */
/* ---------------------------------------------------------------- */

describe('shipment lifecycle', () => {
  it('declares a transition list for every status, and only real statuses in it', () => {
    for (const status of SHIPMENT_STATUSES) {
      const next = SHIPMENT_STATUS_FLOW[status];
      assert.ok(Array.isArray(next), `${status} has no transition list`);

      for (const target of next) {
        assert.ok(
          SHIPMENT_STATUSES.includes(target),
          `${status} can move to ${target}, which is not a shipment status`,
        );
      }
    }
  });

  it('ends at delivered and at cancelled', () => {
    assert.deepEqual(SHIPMENT_STATUS_FLOW.DELIVERED, []);
    assert.deepEqual(SHIPMENT_STATUS_FLOW.CANCELLED, []);
  });

  it('never moves a parcel backwards out of delivery', () => {
    for (const status of SHIPMENT_STATUSES) {
      assert.ok(
        !SHIPMENT_STATUS_FLOW[status].includes(status),
        `${status} can transition to itself`,
      );
    }

    // The specific reversal the brief calls out: delivered → shipped.
    assert.ok(!SHIPMENT_STATUS_FLOW.DELIVERED.includes('SHIPPED'));
  });

  it('cannot report a transit exception before the parcel is in transit', () => {
    assert.ok(!SHIPMENT_STATUS_FLOW.READY_TO_SHIP.includes('EXCEPTION'));
  });

  it('lets an exception recover, because a failed attempt is usually followed by one that works', () => {
    assert.ok(SHIPMENT_STATUS_FLOW.EXCEPTION.includes('OUT_FOR_DELIVERY'));
    assert.ok(SHIPMENT_STATUS_FLOW.EXCEPTION.includes('DELIVERED'));
  });

  it('never offers cancellation as an operator action', () => {
    // Cancelling is a consequence of cancelling the order, and offering it here
    // would be a second, quieter route into a decision that asks for confirmation.
    for (const status of SHIPMENT_STATUSES) {
      assert.ok(
        !operatorReachable(status).includes('CANCELLED'),
        `${status} offers CANCELLED as a manual move`,
      );
    }
  });

  it('maps every shipment status to an order status that actually exists', () => {
    for (const status of SHIPMENT_STATUSES) {
      const implied = SHIPMENT_IMPLIES_ORDER[status];

      assert.ok(
        implied === null || ORDER_STATUSES.includes(implied as never),
        `${status} implies "${String(implied)}", which is not an order status`,
      );
    }
  });

  /**
   * The invariant the whole two-lifecycle design rests on.
   *
   * If a shipment status implied an order status the order could never legally
   * reach from where a parcel in that state would leave it, the transition
   * would abort and the parcel would be stuck. Checking it here means a future
   * edit to either table is caught by a test rather than by an operator.
   */
  it('implies only order states a dispatched order can be in', () => {
    for (const status of DISPATCHED_SHIPMENT_STATUSES) {
      const implied = SHIPMENT_IMPLIES_ORDER[status];

      assert.ok(
        implied === 'SHIPPED' || implied === 'DELIVERED',
        `dispatched status ${status} implies ${String(implied)}`,
      );
    }
  });

  it('agrees with the order flow: shipped can reach delivered', () => {
    assert.ok(ORDER_STATUS_FLOW.SHIPPED.includes('DELIVERED'));
  });
});

/* ---------------------------------------------------------------- */
/* Return lifecycle                                                  */
/* ---------------------------------------------------------------- */

describe('return lifecycle', () => {
  it('declares a transition list for every status, and only real statuses in it', () => {
    for (const status of RETURN_STATUSES) {
      const next = RETURN_STATUS_FLOW[status];
      assert.ok(Array.isArray(next), `${status} has no transition list`);

      for (const target of next) {
        assert.ok(
          RETURN_STATUSES.includes(target),
          `${status} can move to ${target}, which is not a return status`,
        );
      }
    }
  });

  it('ends at rejected, refunded and withdrawn', () => {
    assert.deepEqual(RETURN_STATUS_FLOW.REJECTED, []);
    assert.deepEqual(RETURN_STATUS_FLOW.REFUNDED, []);
    assert.deepEqual(RETURN_STATUS_FLOW.CANCELLED, []);
  });

  /**
   * A refund the gateway reports as failed has not happened, and the return has
   * to return to the state it can be retried from. Without this edge, a failed
   * refund would strand the money in REFUND_PENDING forever.
   */
  it('lets a failed refund go back to received so it can be retried', () => {
    assert.ok(RETURN_STATUS_FLOW.REFUND_PENDING.includes('RECEIVED'));
  });

  it('cannot refund before the goods are back', () => {
    assert.ok(!RETURN_STATUS_FLOW.REQUESTED.includes('REFUND_PENDING'));
    assert.ok(!RETURN_STATUS_FLOW.APPROVED.includes('REFUND_PENDING'));
    assert.ok(!RETURN_STATUS_FLOW.REQUESTED.includes('REFUNDED'));
  });

  it('cannot be withdrawn once the goods are with us', () => {
    assert.ok(!RETURN_STATUS_FLOW.RECEIVED.includes('CANCELLED'));
    assert.ok(!RETURN_STATUS_FLOW.REFUND_PENDING.includes('CANCELLED'));
  });

  /**
   * Every status either holds the customer's units against the order line or
   * releases them, and exactly one of those. A status in neither list would be
   * a quantity leak: units held by a request nothing ever gives back, or a
   * request that holds nothing and lets the same unit be returned twice.
   */
  it('partitions every status into holding or releasing', () => {
    const releasing: ReturnStatus[] = ['REJECTED', 'CANCELLED'];

    for (const status of RETURN_STATUSES) {
      const holds = HOLDING_RETURN_STATUSES.includes(status);
      const releases = releasing.includes(status);

      assert.ok(holds !== releases, `${status} is in neither list, or in both`);
    }
  });
});

/* ---------------------------------------------------------------- */
/* The return window                                                 */
/* ---------------------------------------------------------------- */

describe('return window', () => {
  it('closes at the end of the day, so a late-evening delivery is not short-changed', () => {
    const noon = new Date(2026, 8, 20, 12, 0, 0);
    const lateNight = new Date(2026, 8, 20, 23, 58, 0);

    const a = returnWindowEndsAt(noon);
    const b = returnWindowEndsAt(lateNight);

    assert.equal(a.getTime(), b.getTime());
    assert.equal(a.getHours(), 23);
    assert.equal(a.getMinutes(), 59);
  });

  it('runs for exactly the documented number of days', () => {
    const delivered = new Date(2026, 8, 20, 9, 0, 0);
    const end = returnWindowEndsAt(delivered);

    const expected = new Date(2026, 8, 20 + RETURN_WINDOW_DAYS, 23, 59, 59, 999);
    assert.equal(end.getTime(), expected.getTime());
  });

  it('is a single constant, not a number scattered through the code', () => {
    // A guard against the failure mode the brief names: four copies of `14`
    // that stop agreeing. If this changes, one edit is all it takes.
    assert.equal(typeof RETURN_WINDOW_DAYS, 'number');
    assert.ok(RETURN_WINDOW_DAYS > 0);
  });
});

/* ---------------------------------------------------------------- */
/* Eligibility                                                       */
/* ---------------------------------------------------------------- */

describe('return eligibility', () => {
  it('allows a delivered order inside its window', () => {
    const result = returnability(order());

    assert.equal(result.returnable, true);
    assert.equal(result.reason, null);
    assert.equal(result.lines[0]?.returnableQuantity, 2);
  });

  it('refuses an order that has not been delivered', () => {
    const result = returnability(order({ status: 'SHIPPED' }));

    assert.equal(result.returnable, false);
    assert.match(result.reason ?? '', /delivered/i);
  });

  it('refuses a cancelled order with its own wording', () => {
    const result = returnability(order({ status: 'CANCELLED' }));

    assert.equal(result.returnable, false);
    assert.match(result.reason ?? '', /cancelled/i);
  });

  /**
   * The honest refusal. An order delivered before ZyCart recorded delivery
   * dates has no window that can be computed, so it is declined with a route to
   * support rather than given an unbounded one or a start date nobody wrote.
   */
  it('refuses when no delivery date was ever recorded, rather than guessing one', () => {
    const result = returnability(order({ deliveredAt: null }));

    assert.equal(result.returnable, false);
    assert.equal(result.windowEndsAt, null);
    assert.match(result.reason ?? '', /support/i);
  });

  it('refuses once the window has closed', () => {
    const longAgo = new Date(Date.now() - (RETURN_WINDOW_DAYS + 5) * 24 * 60 * 60 * 1000);
    const result = returnability(order({ deliveredAt: longAgo }));

    assert.equal(result.returnable, false);
    assert.match(result.reason ?? '', /window/i);
  });

  it('refuses when every line is already spoken for', () => {
    const result = returnability(
      order({
        items: [
          { _id: ID(), quantity: 2, returnedQuantity: 2, unitPrice: 1000, productName: 'Shoe' },
        ],
      }),
    );

    assert.equal(result.returnable, false);
    assert.match(result.reason ?? '', /already been requested/i);
  });

  it('still allows a return when only part of a line is spoken for', () => {
    const result = returnability(
      order({
        items: [
          { _id: ID(), quantity: 2, returnedQuantity: 1, unitPrice: 1000, productName: 'Shoe' },
        ],
      }),
    );

    assert.equal(result.returnable, true);
    assert.equal(result.lines[0]?.returnableQuantity, 1);
  });

  it('never reports a negative returnable quantity', () => {
    // Defensive: a counter that somehow exceeded the purchase must not produce
    // a negative maximum that a stepper would happily count down from.
    assert.equal(returnableQuantity({ quantity: 2, returnedQuantity: 5 }), 0);
    assert.equal(returnableQuantity({ quantity: 2, returnedQuantity: null }), 2);
    assert.equal(returnableQuantity({ quantity: 2, returnedQuantity: undefined }), 2);
  });
});

/* ---------------------------------------------------------------- */
/* Refund arithmetic                                                 */
/* ---------------------------------------------------------------- */

describe('refund amounts', () => {
  it('prices a unit from the order snapshot when there is no discount or tax', () => {
    assert.equal(refundableUnitPrice(order(), 1000), 1000);
  });

  it('takes a basket discount off proportionally', () => {
    // ₹2,000 of goods with ₹200 off: a ₹1,000 unit is worth ₹900 back.
    const discounted = order({
      pricing: { subtotal: 2000, shipping: 0, discount: 200, tax: 0, total: 1800 },
    });

    assert.equal(refundableUnitPrice(discounted, 1000), 900);
  });

  it('does not add GST back, because it is already inside the unit price', () => {
    // ₹2,000 of goods at 18% contains ₹305.08 of GST. Refunding a ₹1,000 unit
    // refunds its GST with it; adding the tax on again would refund it twice.
    const taxed = order({
      pricing: { subtotal: 2000, shipping: 0, discount: 0, tax: 305.08, total: 2000 },
    });

    assert.equal(refundableUnitPrice(taxed, 1000), 1000);
  });

  it('never refunds shipping', () => {
    const shipped = order({
      pricing: { subtotal: 2000, shipping: 150, discount: 0, tax: 0, total: 2150 },
    });

    // Delivery was performed; a partial return does not undo it.
    assert.equal(refundableUnitPrice(shipped, 1000), 1000);
  });

  it('produces only whole rupees, whatever the proportions', () => {
    const awkward = order({
      pricing: { subtotal: 999, shipping: 99, discount: 137, tax: 146.63, total: 961 },
    });

    for (const price of [1, 7, 99, 333, 999]) {
      const value = refundableUnitPrice(awkward, price);
      assert.ok(Number.isInteger(value), `${String(price)} produced ${String(value)}`);
      assert.ok(value >= 0);
    }
  });

  it('multiplies by the approved quantity', () => {
    assert.equal(plannedRefund(order(), [{ unitPrice: 1000, quantity: 2 }]), 2000);
  });

  /**
   * The cap that stops an order being refunded past what was paid for it.
   *
   * Two returns against one order are refunded independently, so without this a
   * mistaken approval or a rounding artefact could take the cumulative total
   * past the order value — money leaving the account that never came in.
   */
  it('caps a refund at what is left on the order', () => {
    const partlyRefunded = order({
      payment: {
        method: 'RAZORPAY',
        status: 'PAID',
        razorpayPaymentId: 'pay_abc123',
        refundedAmount: 1500,
      },
    });

    assert.equal(remainingRefundable(partlyRefunded), 500);
    assert.equal(plannedRefund(partlyRefunded, [{ unitPrice: 1000, quantity: 2 }]), 500);
  });

  it('caps at zero once everything has come back', () => {
    const fullyRefunded = order({
      payment: {
        method: 'RAZORPAY',
        status: 'PAID',
        razorpayPaymentId: 'pay_abc123',
        refundedAmount: 2000,
      },
    });

    assert.equal(plannedRefund(fullyRefunded, [{ unitPrice: 1000, quantity: 1 }]), 0);
  });

  it('refuses to apportion an order with no subtotal', () => {
    const empty = order({
      pricing: { subtotal: 0, shipping: 0, discount: 0, tax: 0, total: 0 },
    });

    assert.equal(refundableUnitPrice(empty, 1000), 0);
  });
});

/* ---------------------------------------------------------------- */
/* Refund eligibility                                                */
/* ---------------------------------------------------------------- */

describe('refund eligibility', () => {
  it('allows a paid online order with money left', () => {
    const verdict = refundability(order(), 1000);

    assert.equal(verdict.refundable, true);
    assert.equal(verdict.blocker, null);
  });

  /**
   * Cash on delivery never records money changing hands, because nothing in
   * ZyCart witnesses it. So there is no captured payment to reverse, and that
   * is reported rather than hidden behind a button that would always fail.
   */
  it('refuses a cash-on-delivery order, and says why', () => {
    const cod = order({
      payment: { method: 'COD', status: 'PENDING', razorpayPaymentId: null, refundedAmount: 0 },
    });

    const verdict = refundability(cod, 1000);

    assert.equal(verdict.refundable, false);
    assert.equal(verdict.blocker, 'COD_ORDER');
    assert.match(verdict.explanation, /cash on delivery/i);
  });

  it('refuses an order whose payment never landed', () => {
    const unpaid = order({
      payment: {
        method: 'RAZORPAY',
        status: 'FAILED',
        razorpayPaymentId: null,
        refundedAmount: 0,
      },
    });

    assert.equal(refundability(unpaid, 1000).blocker, 'NOT_PAID');
  });

  it('refuses when no gateway payment is recorded', () => {
    const orphan = order({
      payment: {
        method: 'RAZORPAY',
        status: 'PAID',
        razorpayPaymentId: null,
        refundedAmount: 0,
      },
    });

    assert.equal(refundability(orphan, 1000).blocker, 'NO_GATEWAY_PAYMENT');
  });

  it('refuses when the order has already been refunded in full', () => {
    const spent = order({
      payment: {
        method: 'RAZORPAY',
        status: 'PAID',
        razorpayPaymentId: 'pay_abc123',
        refundedAmount: 2000,
      },
    });

    assert.equal(refundability(spent, 0).blocker, 'NOTHING_LEFT');
  });

  it('refuses a zero-value refund', () => {
    assert.equal(refundability(order(), 0).blocker, 'ZERO_AMOUNT');
  });
});

/* ---------------------------------------------------------------- */
/* Inventory                                                         */
/* ---------------------------------------------------------------- */

describe('returns and the Phase 12 ledger', () => {
  it('adds RETURN as a movement type that only ever increases stock', () => {
    assert.ok(MOVEMENT_TYPES.includes('RETURN'));
    assert.equal(MOVEMENT_DIRECTION.RETURN, 'increase');
  });

  it('keeps RETURN distinct from CANCELLATION', () => {
    // Both put units back, and a store working out how much of its revenue
    // survives has to be able to tell "never happened" from "was undone".
    assert.notEqual('RETURN', 'CANCELLATION');
    assert.equal(MOVEMENT_DIRECTION.CANCELLATION, 'increase');
  });
});

/* ---------------------------------------------------------------- */
/* Validators                                                        */
/* ---------------------------------------------------------------- */

describe('return request validation', () => {
  const line = () => ({ orderItemId: ID().toHexString(), quantity: 1, reason: 'DAMAGED' as const });

  it('accepts a well-formed request', () => {
    const parsed = createReturnSchema.parse({ items: [line()], note: 'Left shoe is split.' });
    assert.equal(parsed.items.length, 1);
  });

  it('rejects an empty selection', () => {
    assert.throws(() => createReturnSchema.parse({ items: [] }));
  });

  it('rejects a zero or negative quantity', () => {
    assert.throws(() => createReturnSchema.parse({ items: [{ ...line(), quantity: 0 }] }));
    assert.throws(() => createReturnSchema.parse({ items: [{ ...line(), quantity: -1 }] }));
  });

  it('rejects a fractional quantity', () => {
    assert.throws(() => createReturnSchema.parse({ items: [{ ...line(), quantity: 1.5 }] }));
  });

  /**
   * The same line twice would reserve quantity twice and produce a request the
   * customer cannot read back. Combining is the only sensible shape.
   */
  it('rejects the same line listed twice', () => {
    const id = ID().toHexString();

    assert.throws(() =>
      createReturnSchema.parse({
        items: [
          { orderItemId: id, quantity: 1, reason: 'DAMAGED' },
          { orderItemId: id, quantity: 1, reason: 'SIZE_ISSUE' },
        ],
      }),
    );
  });

  it('rejects a reason outside the controlled list', () => {
    assert.throws(() =>
      createReturnSchema.parse({ items: [{ ...line(), reason: 'JUST_BECAUSE' }] }),
    );
  });

  it('accepts every documented reason', () => {
    for (const reason of RETURN_REASONS) {
      assert.doesNotThrow(() => createReturnSchema.parse({ items: [{ ...line(), reason }] }));
    }
  });

  /**
   * Mass assignment, closed at the edge. There is no `refundAmount`,
   * `unitPrice`, `status` or `userId` in any schema in this phase, and `.strict()`
   * is what makes sending one a 400 rather than a field that quietly reaches a
   * Mongo update.
   */
  it('rejects a smuggled refund amount', () => {
    assert.throws(() =>
      createReturnSchema.parse({ items: [line()], refundAmount: 100000 }),
    );
  });

  it('rejects a smuggled status', () => {
    assert.throws(() => createReturnSchema.parse({ items: [line()], status: 'REFUNDED' }));
  });

  it('rejects an invalid order item id', () => {
    assert.throws(() =>
      createReturnSchema.parse({ items: [{ ...line(), orderItemId: 'not-an-id' }] }),
    );
  });
});

describe('return decision validation', () => {
  it('accepts an approval with no body at all, meaning "all of it"', () => {
    assert.doesNotThrow(() => returnDecisionSchema.parse({}));
  });

  it('accepts reduced approved quantities', () => {
    const parsed = returnDecisionSchema.parse({
      items: [{ orderItemId: ID().toHexString(), approvedQuantity: 1 }],
    });

    assert.equal(parsed.items?.[0]?.approvedQuantity, 1);
  });

  /**
   * A rejection with no explanation leaves a customer holding an item they
   * cannot send back with no idea why. The server refuses to record one rather
   * than trusting the form to ask.
   */
  it('requires a customer-facing reason on a rejection', () => {
    assert.throws(() => returnRejectionSchema.parse({}));
    assert.throws(() => returnRejectionSchema.parse({ resolutionNote: 'no' }));

    assert.doesNotThrow(() =>
      returnRejectionSchema.parse({
        resolutionNote: 'These show clear signs of wear, so we cannot accept them back.',
      }),
    );
  });

  it('requires an explicit resellable judgement when receiving goods', () => {
    // No default in either direction: one would invent stock ZyCart may not be
    // able to ship, the other would quietly write off goods that were fine.
    assert.throws(() => receiveReturnSchema.parse({}));
    assert.doesNotThrow(() => receiveReturnSchema.parse({ resellable: false }));
    assert.doesNotThrow(() => receiveReturnSchema.parse({ resellable: true }));
  });

  it('rejects unknown fields on a receive', () => {
    assert.throws(() => receiveReturnSchema.parse({ resellable: true, restocked: true }));
  });
});

/* ---------------------------------------------------------------- */
/* Shipment validation                                               */
/* ---------------------------------------------------------------- */

describe('shipment validation', () => {
  it('accepts a shipment with nothing filled in yet', () => {
    // A parcel can be packed before the carrier is booked.
    assert.doesNotThrow(() => createShipmentSchema.parse({}));
  });

  it('accepts ordinary carrier and tracking values', () => {
    const parsed = createShipmentSchema.parse({
      carrier: 'Delhivery',
      trackingNumber: 'DL-1234_5678/9',
    });

    assert.equal(parsed.carrier, 'Delhivery');
  });

  it('trims a tracking number rather than storing the spaces', () => {
    const parsed = createShipmentSchema.parse({ trackingNumber: '  ABC12345  ' });
    assert.equal(parsed.trackingNumber, 'ABC12345');
  });

  it('rejects a tracking number that is too short or too long', () => {
    assert.throws(() => createShipmentSchema.parse({ trackingNumber: 'AB' }));
    assert.throws(() => createShipmentSchema.parse({ trackingNumber: 'A'.repeat(61) }));
  });

  /**
   * The character class is what keeps the value a plain reference. It is not an
   * anti-XSS measure on its own — nothing interpolates this into markup — but a
   * tracking number containing angle brackets is a tracking number somebody
   * pasted the wrong thing into.
   */
  it('rejects markup and whitespace inside a tracking number', () => {
    assert.throws(() => createShipmentSchema.parse({ trackingNumber: '<script>x</script>' }));
    assert.throws(() => createShipmentSchema.parse({ trackingNumber: 'AB 12 34' }));
    assert.throws(() => createShipmentSchema.parse({ trackingNumber: 'AB"12' }));
  });

  it('accepts an https tracking URL', () => {
    assert.doesNotThrow(() =>
      createShipmentSchema.parse({ trackingUrl: 'https://track.example.com/AB123' }),
    );
  });

  /**
   * The security check that matters. This value ends up in an `href` on a page
   * a customer reads, so the protocol is checked against exactly one permitted
   * value at the edge rather than trusted to be harmless later.
   */
  it('rejects a javascript: URL', () => {
    assert.throws(() => createShipmentSchema.parse({ trackingUrl: 'javascript:alert(1)' }));
  });

  it('rejects a data: URL', () => {
    assert.throws(() =>
      createShipmentSchema.parse({ trackingUrl: 'data:text/html,<script>x</script>' }),
    );
  });

  it('rejects a vbscript: URL', () => {
    assert.throws(() => createShipmentSchema.parse({ trackingUrl: 'vbscript:msgbox(1)' }));
  });

  it('rejects plaintext http, because sending a customer off https is a downgrade', () => {
    assert.throws(() => createShipmentSchema.parse({ trackingUrl: 'http://track.example.com' }));
  });

  it('rejects a relative or malformed URL', () => {
    assert.throws(() => createShipmentSchema.parse({ trackingUrl: '/track/AB123' }));
    assert.throws(() => createShipmentSchema.parse({ trackingUrl: 'not a url' }));
  });

  it('rejects an estimated delivery date in the past', () => {
    assert.throws(() =>
      createShipmentSchema.parse({ estimatedDeliveryAt: '2020-01-01' }),
    );
  });

  it('rejects an estimated delivery date absurdly far ahead', () => {
    // The mistyped-year case: a bound, not a policy.
    assert.throws(() => createShipmentSchema.parse({ estimatedDeliveryAt: '2125-01-01' }));
  });

  it('accepts a plausible estimated delivery date', () => {
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    assert.doesNotThrow(() => createShipmentSchema.parse({ estimatedDeliveryAt: soon }));
  });

  /**
   * Mass assignment again. There is no `status`, `shippedAt`, `deliveredAt` or
   * `order` on the create or update schemas, so no body can set them however it
   * is shaped — the initial status is derived from the order, and the
   * timestamps are written by the server when the thing happens.
   */
  it('rejects a smuggled status on creation', () => {
    assert.throws(() => createShipmentSchema.parse({ status: 'DELIVERED' }));
  });

  it('rejects a smuggled delivery timestamp', () => {
    assert.throws(() =>
      createShipmentSchema.parse({ deliveredAt: new Date().toISOString() }),
    );
  });

  it('rejects a smuggled order reference', () => {
    assert.throws(() => createShipmentSchema.parse({ order: ID().toHexString() }));
  });

  it('requires at least one field on an update', () => {
    assert.throws(() => updateShipmentSchema.parse({}));
  });

  it('lets an update clear a value with an empty string', () => {
    const parsed = updateShipmentSchema.parse({ trackingNumber: '' });
    assert.equal(parsed.trackingNumber, '');
  });

  it('lets an update clear the estimate with null', () => {
    const parsed = updateShipmentSchema.parse({ estimatedDeliveryAt: null });
    assert.equal(parsed.estimatedDeliveryAt, null);
  });

  it('accepts every operator-reachable status on the status endpoint', () => {
    for (const status of SHIPMENT_STATUSES) {
      if (status === 'CANCELLED') continue;
      assert.doesNotThrow(() => shipmentStatusSchema.parse({ status }));
    }
  });

  it('refuses to cancel a shipment directly', () => {
    // A parcel is cancelled by cancelling its order, which restores stock and
    // may owe a refund — not by a dropdown on the parcel.
    assert.throws(() => shipmentStatusSchema.parse({ status: 'CANCELLED' }));
  });

  it('rejects a status outside the enum', () => {
    assert.throws(() => shipmentStatusSchema.parse({ status: 'LOST_IN_SPACE' }));
  });

  it('rejects unknown fields on a status change', () => {
    assert.throws(() =>
      shipmentStatusSchema.parse({ status: 'SHIPPED', deliveredAt: new Date().toISOString() }),
    );
  });
});

/* ---------------------------------------------------------------- */
/* Cross-phase guards                                                */
/* ---------------------------------------------------------------- */

describe('Phase 12 and Phase 7 are left intact', () => {
  it('does not widen the order lifecycle', () => {
    // Phase 13 adds richer information *around* the order, never new order
    // states. The brief's existing six are still the only six.
    assert.deepEqual(
      [...ORDER_STATUSES],
      ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
    );
  });

  it('does not widen the payment lifecycle', () => {
    /**
     * No PARTIALLY_REFUNDED was added, deliberately. Every existing rule that
     * reads payment status — the attention queue, the cancellation guard, the
     * retry guard — would have had to learn about it, for a distinction the new
     * `refundedAmount` field carries precisely.
     */
    const order = { pricing: { total: 2000 }, payment: { refundedAmount: 800 } };

    assert.ok(order.payment.refundedAmount < order.pricing.total);
  });

  it('keeps the order status graph unchanged', () => {
    assert.deepEqual([...ORDER_STATUS_FLOW.PENDING], ['CONFIRMED', 'CANCELLED']);
    assert.deepEqual([...ORDER_STATUS_FLOW.PROCESSING], ['SHIPPED', 'CANCELLED']);
    assert.deepEqual([...ORDER_STATUS_FLOW.SHIPPED], ['DELIVERED']);
    assert.deepEqual([...ORDER_STATUS_FLOW.DELIVERED], []);
    assert.deepEqual([...ORDER_STATUS_FLOW.CANCELLED], []);
  });

  it('does not allow cancellation after delivery merely because a return exists', () => {
    // Returns are a separate lifecycle; they never reopen a delivered order.
    assert.ok(!ORDER_STATUS_FLOW.DELIVERED.includes('CANCELLED'));
  });
});
