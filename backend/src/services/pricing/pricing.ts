import { FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_FEE } from '../../config/commerce';

/**
 * The money on a checkout, and on the order it becomes.
 *
 * ## One function prices both
 *
 * The checkout page and order creation call `priceOrder` with the same lines,
 * so the total a customer is shown and the total they are charged cannot come
 * from two implementations that drift apart. Nothing here reads the database,
 * the clock or the request: it is arithmetic over numbers the caller has
 * already established, which is also what makes it exhaustively testable.
 *
 * ## GST is inside the price, not on top of it
 *
 * Indian retail prices are quoted inclusive of all taxes — for packaged goods
 * the Legal Metrology rules require it — and ZyCart's catalogue prices have
 * always been the prices customers pay. So GST is *extracted* from what the
 * customer pays rather than added to it:
 *
 *     total = subtotal − discount + shipping
 *     tax   = the GST contained in that total
 *
 * Phase 6 carried `tax` as an additive term, anticipating the opposite, and
 * every order it wrote has `tax: 0` — so the two formulas agree on all of them
 * and no stored total changes meaning.
 *
 * ## Paise, and the one place they are allowed
 *
 * Every amount a customer is charged stays in whole rupees: subtotal, discount,
 * shipping and total. GST extracted from a whole-rupee price is almost never a
 * whole number of rupees, though, and an invoice that rounded it would misstate
 * the tax. So the tax figures alone are carried to the paisa. They are computed
 * in integer paise and converted once, and they never feed back into anything
 * that is charged.
 */

/** One line to price: what it costs, and the GST rate it is taxed at. */
export interface PricingLineInput {
  /** Whole rupees, GST-inclusive: unit price × quantity. */
  lineTotal: number;
  /** Percent. */
  gstRate: number;
}

/** What one line contributes, once the discount has been spread across it. */
export interface LinePricing {
  /** The part of the order's discount this line carries. Whole rupees. */
  discountShare: number;
  gstRate: number;
  /** The line's value net of discount and of GST. Rupees, to the paisa. */
  taxableValue: number;
  /** The GST contained in the line's discounted value. Rupees, to the paisa. */
  taxAmount: number;
}

export interface Pricing {
  /** Σ line totals. Whole rupees, GST-inclusive. */
  subtotal: number;
  /** Whole rupees, GST-inclusive. */
  shipping: number;
  /** Whole rupees. Applied to the goods, never to shipping. */
  discount: number;
  /** The GST contained in `total`, goods and shipping together. To the paisa. */
  tax: number;
  /** The GST contained in `shipping`. To the paisa. */
  shippingTax: number;
  /** The rate delivery was taxed at; null when there was nothing to deliver. */
  shippingGstRate: number | null;
  /** `subtotal − discount + shipping`. Whole rupees — the amount charged. */
  total: number;
}

export interface PricedOrder {
  pricing: Pricing;
  /** One entry per input line, in the same order. */
  lines: LinePricing[];
}

const PAISE_PER_RUPEE = 100;

const toRupees = (paise: number): number => paise / PAISE_PER_RUPEE;

/**
 * The GST contained in an inclusive amount, in integer paise.
 *
 * `amount × rate / (100 + rate)`: for ₹1,180 at 18% that is ₹180, leaving a
 * taxable value of ₹1,000. Rounded half-up to the paisa, which is how Indian
 * invoices round each tax figure.
 */
export function inclusiveTaxPaise(amountRupees: number, rate: number): number {
  if (amountRupees <= 0 || rate <= 0) return 0;

  return Math.round((amountRupees * PAISE_PER_RUPEE * rate) / (100 + rate));
}

/**
 * Splits a whole number of rupees across weights, exactly.
 *
 * Largest remainder: every share is floored, and the rupees that flooring left
 * over go to the shares that lost the most. The shares therefore always sum to
 * precisely `amount` — a proportional split that merely rounded each share
 * could hand out one rupee more or less than the discount the customer was
 * quoted, and every line's GST would be computed on a number that did not add
 * up. Ties go to the earlier line, so the split is deterministic.
 */
export function allocate(amount: number, weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);

  if (amount <= 0 || total <= 0) return weights.map(() => 0);

  const exact = weights.map((weight) => (amount * Math.max(0, weight)) / total);
  const shares = exact.map((value) => Math.floor(value));

  let remainder = amount - shares.reduce((sum, share) => sum + share, 0);

  const byLoss = exact
    .map((value, index) => ({ index, loss: value - Math.floor(value) }))
    .sort((a, b) => b.loss - a.loss || a.index - b.index);

  for (const { index } of byLoss) {
    if (remainder <= 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    remainder -= 1;
  }

  return shares;
}

/**
 * What delivery costs for goods worth this much after discount.
 *
 * Nothing to deliver costs nothing — an empty basket is not quoted a fee.
 */
export function shippingFor(goodsAfterDiscount: number, lineCount: number): number {
  if (lineCount === 0) return 0;
  return goodsAfterDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
}

/**
 * Prices a basket.
 *
 * `discount` is whatever a coupon has already been evaluated to; it is clamped
 * to the subtotal here as well, so no caller can produce a negative total.
 *
 * ## Delivery's GST rate
 *
 * Delivery charged alongside goods is not a supply of its own: under the CGST
 * Act a bundle of different goods sold for one price is a *mixed supply*, taxed
 * at the highest rate any part of it attracts. The charge therefore takes the
 * highest rate among the lines, and is null only when there are no lines.
 */
export function priceOrder(lines: readonly PricingLineInput[], discount = 0): PricedOrder {
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const applied = Math.max(0, Math.min(Math.floor(discount), subtotal));

  const shares = allocate(
    applied,
    lines.map((line) => line.lineTotal),
  );

  let taxPaise = 0;

  const priced = lines.map((line, index): LinePricing => {
    const discountShare = shares[index] ?? 0;
    const net = line.lineTotal - discountShare;
    const lineTax = inclusiveTaxPaise(net, line.gstRate);

    taxPaise += lineTax;

    return {
      discountShare,
      gstRate: line.gstRate,
      taxableValue: toRupees(net * PAISE_PER_RUPEE - lineTax),
      taxAmount: toRupees(lineTax),
    };
  });

  const shipping = shippingFor(subtotal - applied, lines.length);
  const shippingGstRate =
    lines.length === 0 ? null : Math.max(...lines.map((line) => line.gstRate));
  const shippingTaxPaise = inclusiveTaxPaise(shipping, shippingGstRate ?? 0);

  return {
    pricing: {
      subtotal,
      shipping,
      discount: applied,
      tax: toRupees(taxPaise + shippingTaxPaise),
      shippingTax: toRupees(shippingTaxPaise),
      shippingGstRate,
      total: subtotal - applied + shipping,
    },
    lines: priced,
  };
}

/**
 * The amount an order charges, from its parts.
 *
 * The single statement of the formula, read by the payment boundary before any
 * money moves. `tax` is deliberately absent: it is contained in the other
 * terms, not added to them.
 */
export function totalOf(pricing: { subtotal: number; shipping: number; discount: number }): number {
  return pricing.subtotal - pricing.discount + pricing.shipping;
}
