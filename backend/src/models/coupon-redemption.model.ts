import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * One order's use of one coupon.
 *
 * ## When one is written
 *
 * When the order *commits*, and not a moment before — the same rule stock
 * follows. A cash-on-delivery order commits when it is placed, so its
 * redemption is written in that transaction. An online order commits when its
 * payment is confirmed, so its redemption is written by payment finalisation.
 * Most Razorpay windows that open are never completed, and letting each of
 * them hold a use would let abandoned checkouts exhaust a limited promotion
 * that nobody had actually bought anything with.
 *
 * ## Why a record as well as `Coupon.usedCount`
 *
 * The counter answers "is it used up?" in one indexed read. It cannot answer
 * "has *this customer* used it?", "which orders used it?" or "was this use
 * given back?" — and those are the questions a per-customer limit, the console
 * and a cancellation each need.
 *
 * ## Giving a use back
 *
 * Cancelling an order sets `releasedAt` rather than deleting the row: the
 * order still happened, a customer was still quoted the discount, and the
 * record of that is worth more than a tidy collection. Only unreleased rows
 * count towards either limit.
 */
const couponRedemptionSchema = new Schema(
  {
    coupon: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
    /** A snapshot, so the console can name the code even after it is deleted. */
    code: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: { type: String, required: true },
    /** Whole rupees, as applied to that order. */
    discount: { type: Number, required: true, min: 0 },
    releasedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

/**
 * One redemption per order, enforced by the database.
 *
 * A payment finalised twice — a webhook and a browser callback, racing — can
 * therefore never record the same order's use twice, whatever the code above
 * it gets wrong.
 */
couponRedemptionSchema.index({ order: 1 }, { unique: true });

/** "How many times has this customer used this code?" */
couponRedemptionSchema.index({ coupon: 1, user: 1, releasedAt: 1 });

export type CouponRedemptionDocument = InferSchemaType<typeof couponRedemptionSchema>;

export const CouponRedemption = model('CouponRedemption', couponRedemptionSchema);
