/**
 * The boundary between how ZyCart stores money and how Razorpay accepts it.
 *
 * ZyCart stores whole rupees as integers — every product price, line total and
 * order total. Razorpay's payment APIs take currency subunits, so ₹5,300 goes
 * over the wire as 530000 paise. That conversion happens here and nowhere else:
 * if paise appear anywhere outside a call to the Razorpay API, something has
 * leaked.
 *
 * No floating point value is produced by any function in this file. The
 * multiplication and division are integer operations on values that are
 * asserted to be integers first, so there is nothing for rounding to do.
 */

/** Paise per rupee. INR is the only currency ZyCart prices in. */
const SUBUNITS_PER_RUPEE = 100;

/**
 * The largest amount this helper will convert.
 *
 * Well below `Number.MAX_SAFE_INTEGER`, so the multiplication cannot lose
 * precision, and far above anything a real ZyCart basket reaches. A total that
 * trips this is a bug upstream, not a large order, so it throws rather than
 * quietly sending a wrong amount to a payment gateway.
 */
const MAX_RUPEES = 100_000_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/**
 * Refuses anything that is not a whole, non-negative, finite number of rupees.
 *
 * Called before every conversion. A `NaN` total or a stray `5300.5` must never
 * reach the gateway, because the amount a customer is charged has to be exactly
 * the amount the order says.
 */
export function assertWholeRupees(rupees: number, label = 'amount'): void {
  if (!Number.isFinite(rupees)) {
    throw new MoneyError(`${label} is not a finite number`);
  }

  if (!Number.isInteger(rupees)) {
    throw new MoneyError(`${label} must be a whole number of rupees`);
  }

  if (rupees < 0) {
    throw new MoneyError(`${label} cannot be negative`);
  }

  if (rupees > MAX_RUPEES) {
    throw new MoneyError(`${label} is implausibly large`);
  }
}

/**
 * Rupees to the currency subunits Razorpay expects.
 *
 * ₹1 → 100 · ₹5,300 → 530000 · ₹1,14,900 → 11490000
 */
export function rupeesToPaise(rupees: number, label = 'amount'): number {
  assertWholeRupees(rupees, label);
  return rupees * SUBUNITS_PER_RUPEE;
}

/**
 * Paise back to rupees, for comparing a gateway amount against an order total.
 *
 * Throws on an amount that is not a whole number of rupees rather than
 * rounding: a gateway amount that does not divide evenly means the payment is
 * not for this order, and that must fail loudly.
 */
export function paiseToRupees(paise: number, label = 'amount'): number {
  if (!Number.isInteger(paise)) {
    throw new MoneyError(`${label} in paise must be an integer`);
  }

  if (paise % SUBUNITS_PER_RUPEE !== 0) {
    throw new MoneyError(`${label} is not a whole number of rupees`);
  }

  return paise / SUBUNITS_PER_RUPEE;
}

/**
 * Whether a gateway amount in paise is exactly an order total in rupees.
 *
 * Used on every payment verification. Returns false rather than throwing for a
 * malformed gateway amount, because the caller's answer is the same either way:
 * this payment does not match this order.
 */
export function paiseMatchRupees(paise: unknown, rupees: number): boolean {
  if (typeof paise !== 'number' || !Number.isInteger(paise)) return false;

  try {
    return paise === rupeesToPaise(rupees);
  } catch {
    return false;
  }
}

/**
 * Rupees as a person reads them: `1299` → `₹1,299`.
 *
 * One function, so the server never produces `Rs. 1299` on one screen and
 * `₹1,299` on another — a difference small enough to pass review and large
 * enough to make a customer wonder whether two numbers are the same number.
 * The Indian grouping (`₹1,14,900`, not `₹114,900`) comes from the locale and
 * matches what the storefront's own `formatPrice` renders.
 *
 * Whole rupees only, like every other amount in ZyCart. Anything that is not a
 * whole, finite, non-negative number would be a bug upstream, and it throws
 * rather than printing `₹NaN` into an email nobody can recall.
 */
export function formatRupees(rupees: number, label = 'amount'): string {
  assertWholeRupees(rupees, label);
  return `₹${rupees.toLocaleString('en-IN')}`;
}
