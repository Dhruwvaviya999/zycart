/**
 * The store's commercial rules: what delivery costs and how GST is carried.
 *
 * ## Why these are constants and not environment variables
 *
 * They are business decisions, not facts about a deployment. A preview
 * environment and production must charge the same delivery fee, and a value
 * that could differ between the two is a value that eventually will — at which
 * point a customer is quoted one figure on a preview link and charged another
 * in production. `LOW_STOCK_THRESHOLD` and `RETURN_WINDOW_DAYS` are constants
 * for the same reason.
 *
 * The storefront repeats the free-delivery threshold in its marketing copy
 * ("Free shipping on orders above ₹999"). That copy and `FREE_SHIPPING_THRESHOLD`
 * must be changed together; the checkout itself never trusts the copy, because
 * every number a customer is charged is computed here.
 */

/**
 * Goods worth at least this much, after any discount, ship free.
 *
 * After the discount rather than before, because that is what the customer is
 * actually paying for the goods. A coupon that takes a ₹1,050 basket to ₹850
 * has taken it below the line, and quoting free delivery on the strength of a
 * price nobody is paying would be the store subsidising its own promotion
 * without having decided to.
 */
export const FREE_SHIPPING_THRESHOLD = 999;

/** The flat delivery charge below the threshold. Whole rupees, GST-inclusive. */
export const STANDARD_SHIPPING_FEE = 99;

/**
 * The GST rates a category may carry, in percent.
 *
 * The slabs in force since GST 2.0 (22 September 2025) — nil, 5%, 18% and the
 * 40% rate for luxury and sin goods — plus the special 0.25% and 3% rates for
 * precious stones and metals, and the retired 12% and 28% slabs, which remain
 * selectable because goods still in transition and older credit notes quote
 * them. A closed list rather than any number, so a typo cannot tax a category
 * at 180%.
 */
export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40] as const;
export type GstRate = (typeof GST_RATES)[number];

export const isGstRate = (value: unknown): value is GstRate =>
  typeof value === 'number' && (GST_RATES as readonly number[]).includes(value);

/**
 * The rate a category is taxed at until an administrator says otherwise.
 *
 * 18% is the standard rate, and it is also the safe default: a store that
 * under-collects GST owes the difference out of its own margin, whereas one
 * that over-collects has only charged a customer the standard rate.
 */
export const DEFAULT_GST_RATE: GstRate = 18;

/**
 * The GST rate a category is taxed at.
 *
 * `?? DEFAULT_GST_RATE` rather than a bare read, because categories created
 * before Phase 18 have no such field, and a catalogue must not need a migration
 * before it can be sold from.
 */
export function gstRateOf(category: { gstRate?: number | null } | null | undefined): GstRate {
  const rate = category?.gstRate;
  return isGstRate(rate) ? rate : DEFAULT_GST_RATE;
}
