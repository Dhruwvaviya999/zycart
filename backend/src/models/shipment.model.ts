import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * Where the parcel is.
 *
 * ## Why this is a separate document from the order
 *
 * An order's status answers "what is the commercial state of this purchase?" —
 * placed, confirmed, dispatched, complete. A shipment answers "where are the
 * goods?", and the two are not the same question. An order that is SHIPPED can
 * be in transit, out for delivery, or stuck at a hub after a failed delivery
 * attempt, and none of those are order states: they are facts about a parcel.
 *
 * Collapsing them into one enum was the alternative, and it was rejected for
 * the same reason Phase 7 refused to collapse payment into order status. The
 * enum would have had to carry the cross product of both, and every consumer of
 * `order.status` would have had to learn which values meant "money", which
 * meant "parcel" and which meant "sale".
 *
 * ## What stops the two contradicting each other
 *
 * Every shipment status below declares the order status it implies, in
 * `SHIPMENT_IMPLIES_ORDER`. One function in `shipment.service` moves a
 * shipment, and it moves the order through the existing `transitionOrderStatus`
 * in the same transaction whenever the implied status differs from the current
 * one. So `Shipment.status = DELIVERED` alongside `Order.status = PROCESSING`
 * is not a state this system can reach — not by convention, but because the
 * write that would produce it is refused.
 *
 * The reverse direction is handled too: an administrator marking an order
 * SHIPPED from the order page carries any existing shipment forward with it.
 * See `syncShipmentToOrderStatus`.
 *
 * ## There is no NOT_FULFILLED
 *
 * The absence of a shipment document *is* "nothing has been dispatched". A
 * status value that no write ever stores would be a value an operator could
 * read meaning into from an empty filter, which is the same reasoning that kept
 * RESERVATION out of `MOVEMENT_TYPES`.
 */
export const SHIPMENT_STATUSES = [
  /** Packed and labelled, not yet handed to a carrier. */
  'READY_TO_SHIP',
  /** Handed over. This is the moment `shippedAt` records. */
  'SHIPPED',
  /** Moving through the carrier's network. */
  'IN_TRANSIT',
  /** With the delivery agent, expected today. */
  'OUT_FOR_DELIVERY',
  /** Handed to the customer. `deliveredAt` records when. */
  'DELIVERED',
  /**
   * Something went wrong in transit: a failed attempt, a hold, an address
   * problem. Deliberately one state rather than a taxonomy — without a carrier
   * integration ZyCart cannot tell those apart, and inventing the distinction
   * would mean an operator picking a reason from a list nobody could verify.
   */
  'EXCEPTION',
  /** The order was cancelled before the parcel left. */
  'CANCELLED',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/**
 * The legal moves, declared once.
 *
 * Read by the service before every transition and sent to the console so it
 * offers nothing that would be refused — the same arrangement
 * `ORDER_STATUS_FLOW` has. DELIVERED and CANCELLED lead nowhere: a parcel that
 * arrived did not un-arrive, and a shipment that never left is not revived.
 *
 * EXCEPTION is reachable from every in-transit state and leads back out of
 * them, because a failed delivery attempt is routinely followed by a successful
 * one. It is not reachable from READY_TO_SHIP: nothing can go wrong in transit
 * before the parcel is in transit.
 */
export const SHIPMENT_STATUS_FLOW: Readonly<Record<ShipmentStatus, readonly ShipmentStatus[]>> = {
  READY_TO_SHIP: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'EXCEPTION'],
  EXCEPTION: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/**
 * The order status each shipment status implies.
 *
 * This table is the contract that keeps the two lifecycles consistent. It is
 * deliberately many-to-one: four different shipment states all mean the order
 * is SHIPPED, because the commercial fact ("it has left us") is the same for
 * all of them while the operational fact differs.
 */
export const SHIPMENT_IMPLIES_ORDER: Readonly<Record<ShipmentStatus, string | null>> = {
  /**
   * Null on purpose: being packed says nothing about whether the order has been
   * moved to PROCESSING yet, and forcing one would take a decision away from
   * the operator for no gain. Creation still checks the order is in a state
   * where packing makes sense; see `assertShippableOrder`.
   */
  READY_TO_SHIP: null,
  SHIPPED: 'SHIPPED',
  IN_TRANSIT: 'SHIPPED',
  OUT_FOR_DELIVERY: 'SHIPPED',
  EXCEPTION: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

/** Shipment states where the parcel has left the building. */
export const DISPATCHED_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'EXCEPTION',
  'DELIVERED',
];

/** Shipment states that are still moving — the fulfilment queue. */
export const OPEN_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  'READY_TO_SHIP',
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'EXCEPTION',
];

/**
 * Bounds on what an operator may type.
 *
 * Not carrier-specific formats. ZyCart has no carrier integration, so it has no
 * way to know whether `DLV1234567` is a real Delhivery reference — and a
 * validator that guessed would reject correct numbers from a carrier nobody
 * anticipated. What is enforced is what can be enforced honestly: a length, and
 * a character set that keeps the value a plain reference rather than markup.
 */
export const MAX_CARRIER_LENGTH = 60;
export const MIN_TRACKING_LENGTH = 4;
export const MAX_TRACKING_LENGTH = 60;
export const MAX_SHIPMENT_NOTE_LENGTH = 300;
export const MAX_TRACKING_URL_LENGTH = 500;

/**
 * How far ahead an estimated delivery date may be set.
 *
 * A bound, not a promise: it exists so a mistyped year is refused by the server
 * rather than showing a customer a delivery date in 2125.
 */
export const MAX_ESTIMATE_DAYS_AHEAD = 120;

/** One recorded step in this parcel's history. Append-only. */
const shipmentEventSchema = new Schema(
  {
    status: { type: String, enum: SHIPMENT_STATUSES, required: true },
    at: { type: Date, required: true },
    /** The operator's own words, where they gave any. Safe to render. */
    note: { type: String, trim: true, maxlength: MAX_SHIPMENT_NOTE_LENGTH, default: '' },
    actorName: { type: String, default: '' },
  },
  { _id: false },
);

const shipmentSchema = new Schema(
  {
    /**
     * One shipment per order, enforced by the unique index below.
     *
     * ZyCart ships an order as one parcel. Split shipments are a real thing and
     * this schema could carry them — the constraint is the index, not the shape
     * — but nothing in the order model divides lines between parcels, so
     * allowing several here would produce shipments that no part of the system
     * could say what was inside.
     */
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    /** Snapshotted so an admin list reads without a join. */
    orderNumber: { type: String, required: true },
    /** For scoping a customer's own shipment lookups without loading the order. */
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    status: { type: String, enum: SHIPMENT_STATUSES, required: true, default: 'READY_TO_SHIP' },

    /**
     * Free text, because there is no carrier integration to constrain it
     * against. The console offers the carriers ZyCart actually uses as
     * suggestions; the field accepts anything within bounds, because the day a
     * parcel goes out with a local courier the operator must be able to say so.
     */
    carrier: { type: String, trim: true, maxlength: MAX_CARRIER_LENGTH, default: '' },
    trackingNumber: { type: String, trim: true, maxlength: MAX_TRACKING_LENGTH, default: '' },

    /**
     * Where the customer can follow the parcel.
     *
     * Validated as an absolute `https:` URL before it is ever stored, and
     * rendered as an ordinary link with `rel="noopener noreferrer"` — never as
     * markup, and never interpolated into an attribute that could execute. A
     * `javascript:` URL cannot reach this field.
     */
    trackingUrl: { type: String, trim: true, maxlength: MAX_TRACKING_URL_LENGTH, default: '' },

    /**
     * Only ever set when the thing actually happened.
     *
     * Null is the honest answer for a parcel that has not shipped, and the
     * interface renders the absence rather than substituting `createdAt`. That
     * restriction is the whole reason the customer timeline can be trusted.
     */
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },

    /**
     * What the operator was told to expect, if anything.
     *
     * Never computed. ZyCart has no carrier API and no transit-time model, so
     * an estimate exists only because a person entered one, and its absence is
     * shown as "not available" rather than filled in with a guess.
     */
    estimatedDeliveryAt: { type: Date, default: null },

    /** Operational detail. Also shown to the customer on an exception. */
    note: { type: String, trim: true, maxlength: MAX_SHIPMENT_NOTE_LENGTH, default: '' },

    /** Every status this shipment has held, with when and who. */
    events: { type: [shipmentEventSchema], default: [] },

    createdByName: { type: String, default: '' },
  },
  baseSchemaOptions,
);

/**
 * One shipment per order.
 *
 * Declared here rather than as `unique: true` on the path, so it sits with the
 * other indexes and can carry the explanation: this is what makes a
 * double-submitted "Create shipment" form produce one parcel rather than two.
 * Declaring it in both places makes Mongoose warn and silently drop the options
 * on the second definition, which would have left the constraint off.
 */
shipmentSchema.index({ order: 1 }, { unique: true });

/** The customer's "where are my parcels?" query. */
shipmentSchema.index({ user: 1, createdAt: -1 });

/** The fulfilment queue: everything still moving, oldest first. */
shipmentSchema.index({ status: 1, createdAt: -1 });

/**
 * Overdue deliveries, for the operations panel.
 *
 * Partial, because most shipments have no estimate at all and indexing their
 * nulls would be paying for rows the query can never want.
 */
shipmentSchema.index(
  { estimatedDeliveryAt: 1 },
  { partialFilterExpression: { estimatedDeliveryAt: { $type: 'date' } } },
);

/**
 * Looking a parcel up by the number a customer read off an email.
 *
 * Partial rather than plain: most shipments have no tracking number, and an
 * index over a field that is usually the empty string is an index over one key.
 */
shipmentSchema.index(
  { trackingNumber: 1 },
  { partialFilterExpression: { trackingNumber: { $type: 'string', $gt: '' } } },
);

export type ShipmentDocument = InferSchemaType<typeof shipmentSchema>;

export const Shipment = model('Shipment', shipmentSchema);
