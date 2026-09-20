import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * Why a product's stock changed.
 *
 * Every value here corresponds to something ZyCart actually does. There is no
 * RESERVATION, no TRANSFER and no SHRINKAGE, because there is no reservation
 * system, no second warehouse and no stock count to reconcile against — a type
 * that can never be written is worse than a missing one, since it invites an
 * operator to read meaning into an empty filter.
 *
 * The sign of `quantityChange` is not free. Each type below either always
 * increases, always decreases, or is explicitly allowed to do either, and
 * `assertMovementSign` enforces it on every write:
 *
 * ```text
 * SALE               decrease   stock taken for an order
 * CANCELLATION       increase   stock given back when an order is cancelled
 * RETURN             increase   goods sent back and judged resellable
 * INITIAL_STOCK      increase   the quantity a product was created with
 * MANUAL_ADJUSTMENT  either     an operator correcting the count
 * ```
 *
 * MANUAL_ADJUSTMENT is the only one an administrator can cause directly. The
 * others are consequences of the storefront doing its job, recorded by the
 * services that already owned those writes.
 *
 * ## Why RETURN is not CANCELLATION
 *
 * Both put units back, and a single "units came back" type would have been
 * simpler. They are separated because they answer different questions and are
 * counted differently: a cancellation means the order never happened, and a
 * return means it happened and was undone. A store working out how much of its
 * revenue survives has to be able to tell those apart, and a ledger that
 * conflated them could not.
 *
 * Crucially, a RETURN movement is **not** written for every return. It is
 * written only when an operator, holding the item, judges it resellable. A
 * returned pair of shoes that came back damaged leaves a return record and no
 * movement, because no sellable unit came back. See `restockFromReturn`.
 */
export const MOVEMENT_TYPES = [
  'SALE',
  'CANCELLATION',
  'RETURN',
  'INITIAL_STOCK',
  'MANUAL_ADJUSTMENT',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Which direction each type is allowed to move stock. */
export const MOVEMENT_DIRECTION: Readonly<
  Record<MovementType, 'increase' | 'decrease' | 'either'>
> = {
  SALE: 'decrease',
  CANCELLATION: 'increase',
  RETURN: 'increase',
  INITIAL_STOCK: 'increase',
  MANUAL_ADJUSTMENT: 'either',
};

/**
 * The reason an operator gives for a manual adjustment.
 *
 * A controlled vocabulary rather than free text, so "damaged" and "Damaged in
 * transit" and "broke" are one line on a report instead of three. The optional
 * note carries the detail; this carries the category.
 *
 * System movements do not use these — a SALE's reason is the order it belongs
 * to, which is recorded as a reference instead.
 */
export const ADJUSTMENT_REASONS = [
  'RESTOCK',
  'COUNT_CORRECTION',
  'DAMAGED',
  'LOST',
  'FOUND',
  'RETURN',
  'OTHER',
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

/** Reasons that only make sense when stock is going up, and vice versa. */
export const REASON_DIRECTION: Readonly<
  Record<AdjustmentReason, 'increase' | 'decrease' | 'either'>
> = {
  RESTOCK: 'increase',
  FOUND: 'increase',
  RETURN: 'increase',
  DAMAGED: 'decrease',
  LOST: 'decrease',
  COUNT_CORRECTION: 'either',
  OTHER: 'either',
};

/**
 * The largest single adjustment the API will accept.
 *
 * A bound, not a policy: it exists so that a mistyped `-100000` is refused by
 * the server rather than emptying a warehouse, and it sits far above any
 * plausible real correction.
 */
export const MAX_ADJUSTMENT = 100_000;

/**
 * Where the console asks twice.
 *
 * One hundred units is not a rule about inventory; it is a rule about typing.
 * Adjustments in normal operation are single or double digits, so a three-digit
 * one is either a genuine bulk restock — in which case confirming it costs a
 * click — or a slipped finger, in which case the click is the whole point.
 * Sent to the browser rather than duplicated there, so the number an operator
 * is warned at and the number documented here cannot drift apart.
 */
export const LARGE_ADJUSTMENT = 100;

/**
 * What a movement points at, when it points at anything.
 *
 * RETURN joins ORDER rather than replacing it: a restock caused by a return
 * names the return, because that is the record an operator would open to find
 * out why units reappeared — and the return itself names the order.
 */
export const MOVEMENT_REFERENCE_TYPES = ['ORDER', 'PRODUCT', 'RETURN'] as const;
export type MovementReferenceType = (typeof MOVEMENT_REFERENCE_TYPES)[number];

/**
 * One change to one product's stock.
 *
 * Append-only by convention: nothing in ZyCart updates or deletes a movement,
 * because a ledger that can be edited answers no question worth asking. The
 * schema carries `timestamps`, so `updatedAt` exists and should always equal
 * `createdAt`; a divergence would itself be evidence of something wrong.
 *
 * ## Why the before and after are both stored
 *
 * `quantityAfter` is derivable from `quantityBefore + quantityChange`, and it is
 * stored anyway. It is what makes the ledger *checkable*: a timeline whose
 * arithmetic can only be verified against the number it was computed from
 * verifies nothing. Stored, the invariant becomes an assertion any reader — a
 * test, a report, a person — can make, and a gap between one movement's
 * `quantityAfter` and the next one's `quantityBefore` reveals a write that
 * bypassed this ledger.
 *
 * ## Why this is product-level
 *
 * ZyCart holds one sellable quantity per product. Sizes carry availability
 * (`inStock`) rather than counts, and colours carry neither, so there is no
 * per-variant stock to move. `variant` below records the colour and size an
 * order line named, as context for reading the timeline — it never partitions
 * inventory, and nothing queries stock by it.
 */
const inventoryMovementSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },

    /**
     * The product's name and SKU as they were.
     *
     * A movement outlives the product it describes — deleting a product must
     * not blank out the history of what was sold. The same reasoning as an
     * order's line snapshot, for the same reason.
     */
    productName: { type: String, required: true },
    sku: { type: String, required: true, default: '' },

    /** Colour and size from the order line, when there was one. Context only. */
    variant: {
      type: new Schema(
        {
          color: { type: String, default: null },
          size: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
    },

    type: { type: String, enum: MOVEMENT_TYPES, required: true },

    quantityBefore: { type: Number, required: true, min: 0 },
    /** Signed, and never zero — a movement that moved nothing is not a movement. */
    quantityChange: { type: Number, required: true },
    quantityAfter: { type: Number, required: true, min: 0 },

    /** Present on MANUAL_ADJUSTMENT, absent on the system types. */
    reason: { type: String, enum: ADJUSTMENT_REASONS, default: null },
    note: { type: String, trim: true, maxlength: 300, default: '' },

    referenceType: { type: String, enum: MOVEMENT_REFERENCE_TYPES, default: null },
    referenceId: { type: Schema.Types.ObjectId, default: null },
    /** The order number, so the timeline reads "Order ZY10482" without a lookup. */
    referenceLabel: { type: String, default: '' },

    /**
     * Who caused it, when a person did.
     *
     * Null for SALE and for a customer's own cancellation: attributing those to
     * an administrator would be a lie, and attributing them to the customer
     * would put a shopper's identity in an operational ledger that does not
     * need it. The order reference is how those movements are traced back to a
     * person, through the order that already records one.
     */
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Snapshotted for the same reason as the product's: staff accounts change. */
    actorName: { type: String, default: '' },
  },
  baseSchemaOptions,
);

/** One product's ledger, newest first — the timeline on the inventory page. */
inventoryMovementSchema.index({ product: 1, createdAt: -1 });

/** The store-wide feed, and the "recently changed" inventory filter. */
inventoryMovementSchema.index({ createdAt: -1 });

/** "What has this administrator been changing?" */
inventoryMovementSchema.index({ actor: 1, createdAt: -1 });

/** Resolves every movement caused by one order, for an order's stock history. */
inventoryMovementSchema.index({ referenceType: 1, referenceId: 1 });

export type InventoryMovementDocument = InferSchemaType<typeof inventoryMovementSchema>;

export const InventoryMovement = model('InventoryMovement', inventoryMovementSchema);
