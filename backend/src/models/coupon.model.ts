import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * How a coupon takes money off.
 *
 * - **PERCENT** — a percentage of the goods, optionally capped by `maxDiscount`.
 * - **FLAT** — a fixed number of rupees.
 *
 * Deliberately two. Free delivery, buy-one-get-one and category-restricted
 * codes are all real promotions, and each is a different rule about *which*
 * money comes off; adding them because the enum could hold them is how a
 * coupon engine becomes a rules engine nobody can predict.
 */
export const COUPON_TYPES = ['PERCENT', 'FLAT'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

/** What a code looks like: short, upper-case, and easy to read aloud. */
export const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

const couponSchema = new Schema(
  {
    /**
     * The code a customer types, stored upper-case.
     *
     * Unique through the index below rather than a check-then-insert, and
     * immutable once created: an order records the code it used, and renaming
     * a code after the fact would leave history pointing at something that no
     * longer exists under that name.
     */
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 },

    /** Shown to the customer when the code applies: "10% off your first order". */
    description: { type: String, trim: true, maxlength: 160, default: '' },

    type: { type: String, enum: COUPON_TYPES, required: true },

    /** Percent (1–100) for PERCENT, whole rupees for FLAT. */
    value: { type: Number, required: true, min: 1 },

    /** A ceiling on a PERCENT discount, in whole rupees. Null means uncapped. */
    maxDiscount: { type: Number, min: 1, default: null },

    /** The goods subtotal a basket must reach first. Whole rupees. */
    minOrderValue: { type: Number, min: 0, default: 0 },

    /** Null means it is valid from creation, or indefinitely. */
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },

    /** How many orders may ever use it. Null means unlimited. */
    usageLimit: { type: Number, min: 1, default: null },

    /**
     * How many orders one customer may use it on. Null means unlimited.
     *
     * The schema defaults to null so that "unlimited" is expressible at all;
     * the console and the create endpoint default a *new* coupon to 1, because
     * a promotion that one customer can apply to every order they ever place is
     * rarely what anybody meant.
     */
    perUserLimit: { type: Number, min: 1, default: null },

    /**
     * How many committed orders are currently holding this coupon.
     *
     * ## Why a counter, and why it is also the lock
     *
     * "Has this code been used up?" could be answered by counting redemptions.
     * It would also be a race: two customers placing the last permitted order
     * at once are two inserts into different documents, which conflict with
     * nothing. Every redemption instead increments this field, inside the same
     * transaction that writes the order, and with the limit in the update's
     * own filter — so the second of two concurrent redemptions either matches
     * nothing or collides with the first on this one document, and MongoDB
     * aborts it for a retry that then sees the truth.
     *
     * That collision is also what makes the per-customer limit safe. Counting a
     * customer's redemptions is a read; the write to this document is what
     * forces two concurrent orders from the same customer to serialise.
     *
     * A cancelled order gives its use back, so this can go down as well as up.
     */
    usedCount: { type: Number, required: true, min: 0, default: 0 },

    /** Switched off by an administrator. Orders that already used it are unaffected. */
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions,
);

couponSchema.index({ code: 1 }, { unique: true });

/** The console's default listing. */
couponSchema.index({ isActive: 1, createdAt: -1 });

export type CouponDocument = InferSchemaType<typeof couponSchema>;

export const Coupon = model('Coupon', couponSchema);
