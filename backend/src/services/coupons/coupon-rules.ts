import type { CouponType } from '../../models/coupon.model';
import { formatRupees } from '../../utils/money';

/**
 * What a coupon is worth, and whether it may be used — as pure functions.
 *
 * The coupon service loads a coupon and counts its uses; everything it then
 * *decides* is decided here, over plain values, with the clock passed in. The
 * checkout preview, order placement and the admin console all ask these
 * functions, so "does this code apply?" has one answer in three places — and
 * the answer can be tested without a database.
 */

/** The fields a rule reads. Structural, so a coupon document satisfies it. */
export interface CouponTerms {
  type: CouponType;
  value: number;
  maxDiscount?: number | null;
  minOrderValue?: number | null;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  usedCount: number;
  isActive: boolean;
}

/**
 * How much a coupon takes off a goods subtotal, in whole rupees.
 *
 * A percentage is floored: ZyCart charges whole rupees, and rounding a
 * discount up is the store paying a paisa it never offered. The result never
 * exceeds the subtotal — a ₹500 voucher on a ₹300 basket is worth ₹300, not a
 * ₹200 credit the store has no way to hold.
 */
export function discountFor(terms: CouponTerms, subtotal: number): number {
  if (subtotal <= 0) return 0;

  const raw = terms.type === 'PERCENT' ? Math.floor((subtotal * terms.value) / 100) : terms.value;
  const capped = terms.maxDiscount ? Math.min(raw, terms.maxDiscount) : raw;

  return Math.max(0, Math.min(capped, subtotal));
}

export type CouponRefusal =
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'EXHAUSTED'
  | 'CUSTOMER_LIMIT'
  | 'BELOW_MINIMUM'
  | 'NOTHING_OFF';

export type CouponVerdict =
  | { applicable: true; discount: number }
  | { applicable: false; refusal: CouponRefusal; message: string };

/**
 * Where a coupon stands, for the console.
 *
 * Ordered by what an operator most needs to know: a switched-off code is
 * INACTIVE whatever its dates say, and one that has run out is EXHAUSTED even
 * though it is still inside its window.
 */
export type CouponState = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'EXHAUSTED' | 'INACTIVE';

export function couponState(terms: CouponTerms, now: Date = new Date()): CouponState {
  if (!terms.isActive) return 'INACTIVE';
  if (terms.expiresAt && terms.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (terms.usageLimit && terms.usedCount >= terms.usageLimit) return 'EXHAUSTED';
  if (terms.startsAt && terms.startsAt.getTime() > now.getTime()) return 'SCHEDULED';
  return 'ACTIVE';
}

export interface CouponContext {
  /** The goods subtotal, before any discount. Whole rupees. */
  subtotal: number;
  now: Date;
  /**
   * How many of this customer's orders already hold this coupon.
   *
   * Includes their unpaid online orders as well as committed ones — see
   * `customerUses` in the coupon service for why.
   */
  customerUses: number;
}

/**
 * Whether a coupon applies to this basket for this customer, and for how much.
 *
 * The refusals are in the order a customer can do something about them last:
 * there is no point telling somebody to add ₹200 more to a basket for a code
 * that has expired.
 */
export function evaluateCoupon(terms: CouponTerms, context: CouponContext): CouponVerdict {
  const refuse = (refusal: CouponRefusal, message: string): CouponVerdict => ({
    applicable: false,
    refusal,
    message,
  });

  switch (couponState(terms, context.now)) {
    case 'INACTIVE':
      return refuse('INACTIVE', 'This code is no longer active.');
    case 'EXPIRED':
      return refuse('EXPIRED', 'This code has expired.');
    case 'EXHAUSTED':
      return refuse('EXHAUSTED', 'This code has reached its usage limit.');
    case 'SCHEDULED':
      return refuse('NOT_STARTED', 'This code is not active yet.');
    case 'ACTIVE':
      break;
  }

  if (terms.perUserLimit && context.customerUses >= terms.perUserLimit) {
    return refuse(
      'CUSTOMER_LIMIT',
      terms.perUserLimit === 1
        ? 'You have already used this code.'
        : `You have already used this code ${String(terms.perUserLimit)} times.`,
    );
  }

  const minimum = terms.minOrderValue ?? 0;

  if (context.subtotal < minimum) {
    return refuse(
      'BELOW_MINIMUM',
      `Add ${formatRupees(minimum - context.subtotal)} more to use this code — it needs a ` +
        `subtotal of ${formatRupees(minimum)}.`,
    );
  }

  const discount = discountFor(terms, context.subtotal);

  if (discount <= 0) {
    return refuse('NOTHING_OFF', 'This code does not take anything off this basket.');
  }

  return { applicable: true, discount };
}

/** "10% off (up to ₹500)" / "₹200 off" — how the console and checkout name a deal. */
export function describeDeal(terms: Pick<CouponTerms, 'type' | 'value' | 'maxDiscount'>): string {
  if (terms.type === 'FLAT') return `${formatRupees(terms.value)} off`;

  return terms.maxDiscount
    ? `${String(terms.value)}% off (up to ${formatRupees(terms.maxDiscount)})`
    : `${String(terms.value)}% off`;
}
