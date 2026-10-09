import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_GST_RATE,
  FREE_SHIPPING_THRESHOLD,
  gstRateOf,
  isGstRate,
  STANDARD_SHIPPING_FEE,
} from '../src/config/commerce';
import { loadEnv } from '../src/config/env';
import {
  couponState,
  describeDeal,
  discountFor,
  evaluateCoupon,
  type CouponTerms,
} from '../src/services/coupons/coupon-rules';
import { Types } from 'mongoose';
import { Order } from '../src/models/order.model';
import { resolveState, stateOfGstin } from '../src/services/invoices/indian-states';
import { financialYearOf, formatInvoiceNumber } from '../src/services/invoices/invoice-number';
import { buildInvoice, rupeesInWords, splitTax } from '../src/services/invoices/invoice.service';
import { assertOrderTotalIntact } from '../src/services/payment.service';
import {
  allocate,
  inclusiveTaxPaise,
  priceOrder,
  shippingFor,
  totalOf,
} from '../src/services/pricing/pricing';
import { createCouponSchema, couponCodeSchema } from '../src/validators/coupon.validator';

/**
 * Phase 18's money: pricing, coupons and invoices.
 *
 * Pure functions, tested without a database — the same choice the returns and
 * notifications suites made. What needs a replica set (a coupon's limit holding
 * under two concurrent orders, an invoice number drawn once per shipment) is
 * guaranteed by the database constructs those functions are built on, and is
 * described where they are.
 */

const BASE_ENV = {
  MONGODB_URI: 'mongodb://localhost:27017/zycart-test',
  JWT_SECRET: 'x'.repeat(48),
  CLERK_SECRET_KEY: `sk_test_${'x'.repeat(40)}`,
  CLERK_PUBLISHABLE_KEY: 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k',
  AI_ENABLED: 'false',
};

const paise = (rupees: number): number => Math.round(rupees * 100);

/* ---------------------------------------------------------------- */

describe('Pricing — GST inside the price', () => {
  it('extracts the GST contained in an inclusive amount, to the paisa', () => {
    // ₹1,180 at 18% is ₹1,000 of goods and ₹180 of tax.
    assert.equal(inclusiveTaxPaise(1180, 18), 18_000);
    assert.equal(inclusiveTaxPaise(105, 5), 500);
    assert.equal(inclusiveTaxPaise(999, 0), 0);
  });

  it('never adds tax to the total', () => {
    const { pricing } = priceOrder([{ lineTotal: 1180, gstRate: 18 }]);

    assert.equal(pricing.total, 1180);
    assert.equal(pricing.tax, 180);
    assert.equal(totalOf(pricing), pricing.total);
  });

  it('prices an empty basket at nothing, with no delivery charge', () => {
    const { pricing, lines } = priceOrder([]);

    assert.deepEqual(lines, []);
    assert.equal(pricing.total, 0);
    assert.equal(pricing.shipping, 0);
    assert.equal(pricing.shippingGstRate, null);
  });

  it('charges delivery below the threshold and not at or above it', () => {
    assert.equal(shippingFor(FREE_SHIPPING_THRESHOLD - 1, 1), STANDARD_SHIPPING_FEE);
    assert.equal(shippingFor(FREE_SHIPPING_THRESHOLD, 1), 0);
    assert.equal(shippingFor(0, 0), 0);
  });

  it('decides free delivery on what is paid for the goods, after the discount', () => {
    const lines = [{ lineTotal: 1050, gstRate: 18 }];

    assert.equal(priceOrder(lines).pricing.shipping, 0);
    // A ₹200 coupon takes the goods to ₹850 — below the line.
    assert.equal(priceOrder(lines, 200).pricing.shipping, STANDARD_SHIPPING_FEE);
  });

  it('taxes delivery at the highest rate in the basket, and counts it in tax', () => {
    const { pricing } = priceOrder([
      { lineTotal: 300, gstRate: 5 },
      { lineTotal: 200, gstRate: 18 },
    ]);

    assert.equal(pricing.shipping, STANDARD_SHIPPING_FEE);
    assert.equal(pricing.shippingGstRate, 18);
    assert.equal(paise(pricing.shippingTax), inclusiveTaxPaise(STANDARD_SHIPPING_FEE, 18));
  });

  it('splits a discount so the shares always sum to it exactly', () => {
    const weights = [333, 333, 334];

    for (const amount of [0, 1, 2, 100, 997, 1000]) {
      const shares = allocate(amount, weights);
      assert.equal(
        shares.reduce((sum, share) => sum + share, 0),
        amount,
        `${String(amount)} split into ${shares.join(', ')}`,
      );
      assert.ok(shares.every((share) => Number.isInteger(share) && share >= 0));
    }
  });

  it('breaks allocation ties towards the earlier line, deterministically', () => {
    assert.deepEqual(allocate(1, [100, 100]), [1, 0]);
    assert.deepEqual(allocate(1, [100, 100]), allocate(1, [100, 100]));
  });

  it('never lets a discount exceed the goods', () => {
    const { pricing } = priceOrder([{ lineTotal: 300, gstRate: 18 }], 5000);

    assert.equal(pricing.discount, 300);
    assert.equal(pricing.total, pricing.shipping);
    assert.ok(pricing.total > 0, 'delivery still applies, so nothing is ever free to pay for');
  });

  it('makes every line net exactly into taxable value plus tax', () => {
    const { pricing, lines } = priceOrder(
      [
        { lineTotal: 2499, gstRate: 18 },
        { lineTotal: 1299, gstRate: 5 },
        { lineTotal: 47, gstRate: 0.25 },
      ],
      377,
    );

    lines.forEach((line, index) => {
      const lineTotal = [2499, 1299, 47][index] ?? 0;
      assert.equal(
        paise(line.taxableValue) + paise(line.taxAmount),
        (lineTotal - line.discountShare) * 100,
      );
    });

    assert.equal(
      lines.reduce((sum, line) => sum + line.discountShare, 0),
      pricing.discount,
    );
    assert.equal(
      paise(pricing.tax),
      lines.reduce((sum, line) => sum + paise(line.taxAmount), 0) + paise(pricing.shippingTax),
    );
  });

  it('keeps every charged figure in whole rupees', () => {
    const { pricing } = priceOrder([{ lineTotal: 777, gstRate: 18 }], 77);

    for (const field of ['subtotal', 'shipping', 'discount', 'total'] as const) {
      assert.ok(Number.isInteger(pricing[field]), `${field} is ${String(pricing[field])}`);
    }
  });

  it('follows the default rate for a category nobody has configured', () => {
    assert.equal(gstRateOf(null), DEFAULT_GST_RATE);
    assert.equal(gstRateOf({ gstRate: null }), DEFAULT_GST_RATE);
    assert.equal(gstRateOf({ gstRate: 5 }), 5);
    assert.equal(gstRateOf({ gstRate: 17 }), DEFAULT_GST_RATE, 'an unknown slab is not trusted');
    assert.equal(isGstRate(40), true);
    assert.equal(isGstRate(180), false);
  });
});

/* ---------------------------------------------------------------- */

const NOW = new Date('2026-10-01T12:00:00.000Z');

function coupon(overrides: Partial<CouponTerms> = {}): CouponTerms {
  return {
    type: 'PERCENT',
    value: 10,
    maxDiscount: null,
    minOrderValue: 0,
    startsAt: null,
    expiresAt: null,
    usageLimit: null,
    perUserLimit: 1,
    usedCount: 0,
    isActive: true,
    ...overrides,
  };
}

describe('Coupons — what a code is worth', () => {
  it('floors a percentage, so the store never gives a paisa it did not offer', () => {
    assert.equal(discountFor(coupon({ value: 10 }), 999), 99);
  });

  it('caps a percentage at its maximum', () => {
    assert.equal(discountFor(coupon({ value: 50, maxDiscount: 500 }), 5000), 500);
  });

  it('never takes off more than the goods are worth', () => {
    assert.equal(discountFor(coupon({ type: 'FLAT', value: 500 }), 300), 300);
    assert.equal(discountFor(coupon(), 0), 0);
  });

  it('names a deal the way the checkout prints it', () => {
    assert.equal(describeDeal(coupon({ value: 10, maxDiscount: 500 })), '10% off (up to ₹500)');
    assert.equal(describeDeal(coupon({ type: 'FLAT', value: 200 })), '₹200 off');
  });
});

describe('Coupons — whether a code applies', () => {
  const context = { subtotal: 2000, now: NOW, customerUses: 0 };

  it('applies a live coupon', () => {
    assert.deepEqual(evaluateCoupon(coupon(), context), { applicable: true, discount: 200 });
  });

  it('refuses a switched-off, expired, used-up or not-yet-started code', () => {
    const cases: [Partial<CouponTerms>, string][] = [
      [{ isActive: false }, 'INACTIVE'],
      [{ expiresAt: new Date('2026-09-30T00:00:00.000Z') }, 'EXPIRED'],
      [{ usageLimit: 10, usedCount: 10 }, 'EXHAUSTED'],
      [{ startsAt: new Date('2026-10-02T00:00:00.000Z') }, 'NOT_STARTED'],
    ];

    for (const [overrides, refusal] of cases) {
      const verdict = evaluateCoupon(coupon(overrides), context);
      assert.equal(verdict.applicable, false);
      if (!verdict.applicable) assert.equal(verdict.refusal, refusal);
    }
  });

  it('refuses a customer who has used up their own allowance', () => {
    const verdict = evaluateCoupon(coupon({ perUserLimit: 1 }), { ...context, customerUses: 1 });
    assert.equal(verdict.applicable, false);
    if (!verdict.applicable) assert.equal(verdict.refusal, 'CUSTOMER_LIMIT');

    // Null is unlimited.
    assert.equal(
      evaluateCoupon(coupon({ perUserLimit: null }), { ...context, customerUses: 50 }).applicable,
      true,
    );
  });

  it('says how much more a basket needs to reach the minimum', () => {
    const verdict = evaluateCoupon(coupon({ minOrderValue: 2499 }), context);

    assert.equal(verdict.applicable, false);
    if (!verdict.applicable) {
      assert.equal(verdict.refusal, 'BELOW_MINIMUM');
      assert.match(verdict.message, /₹499 more/);
    }
  });

  it('reports an expired code as expired even when it is also used up', () => {
    const terms = coupon({ expiresAt: new Date('2026-01-01'), usageLimit: 1, usedCount: 1 });
    assert.equal(couponState(terms, NOW), 'EXPIRED');
  });
});

describe('Coupons — what the console may create', () => {
  const valid = { code: ' welcome10 ', type: 'PERCENT', value: 10 };

  it('upper-cases a code and refuses one that could not be a code', () => {
    assert.equal(couponCodeSchema.parse('welcome10'), 'WELCOME10');
    assert.equal(couponCodeSchema.safeParse('no spaces').success, false);
    assert.equal(couponCodeSchema.safeParse('ab').success, false);
  });

  it('refuses a percentage over 100', () => {
    assert.equal(createCouponSchema.safeParse({ ...valid, value: 150 }).success, false);
  });

  it('refuses a cap on a flat coupon', () => {
    assert.equal(
      createCouponSchema.safeParse({ ...valid, type: 'FLAT', value: 200, maxDiscount: 100 })
        .success,
      false,
    );
  });

  it('refuses an expiry before the start', () => {
    const result = createCouponSchema.safeParse({
      ...valid,
      startsAt: '2026-10-10T00:00:00.000Z',
      expiresAt: '2026-10-01T00:00:00.000Z',
    });
    assert.equal(result.success, false);
  });

  it('refuses fields it does not know, such as a usage count', () => {
    assert.equal(createCouponSchema.safeParse({ ...valid, usedCount: 0 }).success, false);
  });
});

/* ---------------------------------------------------------------- */

describe('Invoices — numbering', () => {
  it('reckons the financial year in IST, from April', () => {
    // 23:59 IST on 31 March is still the old year; 00:00 IST on 1 April is not.
    assert.equal(financialYearOf(new Date('2026-03-31T18:29:00.000Z')), '2025-26');
    assert.equal(financialYearOf(new Date('2026-03-31T18:30:00.000Z')), '2026-27');
    assert.equal(financialYearOf(new Date('2026-12-31T00:00:00.000Z')), '2026-27');
    assert.equal(financialYearOf(new Date('2099-06-01T00:00:00.000Z')), '2099-00');
  });

  it('formats a number GST will accept: at most sixteen characters of the allowed set', () => {
    const number = formatInvoiceNumber('2026-27', 42);

    assert.equal(number, 'ZY/26-27/000042');
    assert.ok(number.length <= 16);
    assert.match(number, /^[A-Za-z0-9/-]+$/);
  });
});

describe('Invoices — states and tax', () => {
  it('reads what customers type as a state', () => {
    assert.equal(resolveState('Gujarat')?.code, '24');
    assert.equal(resolveState(' gujarat ')?.code, '24');
    assert.equal(resolveState('GJ')?.code, '24');
    assert.equal(resolveState('Orissa')?.code, '21');
    assert.equal(resolveState('Jammu & Kashmir')?.code, '01');
    assert.equal(resolveState('NCT of Delhi')?.code, '07');
    assert.equal(resolveState('24')?.code, '24');
    assert.equal(resolveState('Atlantis'), null);
  });

  it('takes the seller’s state from the GSTIN', () => {
    assert.equal(stateOfGstin('27ABCDE1234F1Z5')?.name, 'Maharashtra');
  });

  it('splits intra-state tax evenly, giving an odd paisa to CGST', () => {
    assert.deepEqual(splitTax(18_001, 'INTRA_STATE'), { cgst: 90.01, sgst: 90, igst: 0 });
    assert.deepEqual(splitTax(18_001, 'INTER_STATE'), { cgst: 0, sgst: 0, igst: 180.01 });
  });

  it('states the amount in words, in the Indian system', () => {
    assert.equal(rupeesInWords(1180), 'Rupees One Thousand One Hundred Eighty Only');
    assert.equal(
      rupeesInWords(1_23_45_678),
      'Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight Only',
    );
    assert.equal(rupeesInWords(0), 'Rupees Zero Only');
  });
});

describe('Invoices — the document', () => {
  const env = loadEnv({
    ...BASE_ENV,
    STORE_LEGAL_NAME: 'ZyCart Retail Pvt Ltd',
    STORE_GSTIN: '24ABCDE1234F1Z5',
    STORE_ADDRESS: 'Plot 12, MG Road|Ahmedabad 380009',
  });

  /** An order as `priceOrder` and `createOrder` would have written it. */
  function pricedOrder(state: string) {
    const lines = [
      { productName: 'Air Max', unitPrice: 1180, quantity: 2, gstRate: 18, hsnCode: '6404' },
      { productName: 'Cotton Tee', unitPrice: 525, quantity: 1, gstRate: 5, hsnCode: '6109' },
    ];
    const priced = priceOrder(
      lines.map((line) => ({ lineTotal: line.unitPrice * line.quantity, gstRate: line.gstRate })),
      300,
    );

    return {
      orderNumber: 'ZY10482',
      createdAt: new Date('2026-10-01T06:00:00.000Z'),
      invoice: { number: 'ZY/26-27/000042', issuedAt: new Date('2026-10-02T06:00:00.000Z') },
      coupon: { code: 'SAVE300' },
      payment: { method: 'RAZORPAY', status: 'PAID' },
      shippingAddress: {
        fullName: 'Priya Shah',
        phone: '9800000000',
        addressLine1: '4 Lake View',
        addressLine2: '',
        landmark: '',
        city: 'Surat',
        state,
        postalCode: '395007',
        country: 'India',
      },
      pricing: priced.pricing,
      items: lines.map((line, index) => ({
        ...line,
        sku: `SKU-${String(index)}`,
        lineTotal: line.unitPrice * line.quantity,
        selectedColor: null,
        selectedSize: null,
        ...priced.lines[index],
      })),
    } as unknown as Parameters<typeof buildInvoice>[0];
  }

  it('is a tax invoice when the store has a GSTIN', () => {
    const invoice = buildInvoice(pricedOrder('Gujarat'), env);

    assert.equal(invoice.document, 'TAX_INVOICE');
    assert.equal(invoice.seller.gstin, '24ABCDE1234F1Z5');
    assert.deepEqual(invoice.seller.address, ['Plot 12, MG Road', 'Ahmedabad 380009']);
  });

  it('charges CGST and SGST within the seller’s state, and IGST outside it', () => {
    const local = buildInvoice(pricedOrder('Gujarat'), env);
    assert.equal(local.supplyType, 'INTRA_STATE');
    assert.equal(local.totals.igst, 0);
    assert.ok(local.totals.cgst > 0 && local.totals.sgst > 0);

    const away = buildInvoice(pricedOrder('Maharashtra'), env);
    assert.equal(away.supplyType, 'INTER_STATE');
    assert.equal(away.totals.cgst + away.totals.sgst, 0);
    assert.equal(paise(away.totals.igst), paise(away.totals.tax));
  });

  it('treats a state it cannot recognise as another state', () => {
    assert.equal(buildInvoice(pricedOrder('Gujarath'), env).supplyType, 'INTER_STATE');
  });

  it('adds up, to the paisa: taxable value plus tax is what was charged', () => {
    for (const state of ['Gujarat', 'Maharashtra']) {
      const invoice = buildInvoice(pricedOrder(state), env);

      assert.equal(
        paise(invoice.totals.taxableValue) + paise(invoice.totals.tax),
        invoice.totals.grandTotal * 100,
      );
      assert.equal(
        paise(invoice.totals.cgst) + paise(invoice.totals.sgst) + paise(invoice.totals.igst),
        paise(invoice.totals.tax),
      );
    }
  });

  it('copies figures from the order rather than recomputing them', () => {
    const order = pricedOrder('Gujarat');
    const invoice = buildInvoice(order, env);

    assert.equal(
      invoice.totals.grandTotal,
      (order as unknown as { pricing: { total: number } }).pricing.total,
    );
    assert.equal(invoice.totals.discount, 300);
    assert.equal(invoice.couponCode, 'SAVE300');
    assert.equal(invoice.lines[0]?.hsnCode, '6404');
  });

  it('is a plain invoice for a store with no GSTIN', () => {
    const unregistered = loadEnv({ ...BASE_ENV, STORE_STATE: 'Gujarat' });
    const invoice = buildInvoice(pricedOrder('Gujarat'), unregistered);

    assert.equal(invoice.document, 'INVOICE');
    assert.equal(invoice.supplyType, 'INTRA_STATE', 'STORE_STATE stands in for the GSTIN');
  });
});

/* ---------------------------------------------------------------- */

describe('The payment boundary reads a priced order correctly', () => {
  /**
   * Built as a real Mongoose document, because that is what the check is
   * handed in production — and what broke it once: spreading `order.pricing`,
   * a subdocument, copies its internals rather than its fields, which made
   * every total NaN and would have refused every online payment. A plain
   * object would have hidden that. No database is needed to construct one.
   */
  function pricedDocument(discount: number) {
    const lines = [
      { unitPrice: 1180, quantity: 2, gstRate: 18 },
      { unitPrice: 525, quantity: 1, gstRate: 5 },
    ];
    const priced = priceOrder(
      lines.map((line) => ({ lineTotal: line.unitPrice * line.quantity, gstRate: line.gstRate })),
      discount,
    );

    return new Order({
      orderNumber: 'ZYC-TEST-0001',
      user: new Types.ObjectId(),
      items: lines.map((line, index) => ({
        productName: `Item ${String(index)}`,
        sku: `SKU-${String(index)}`,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.unitPrice * line.quantity,
        ...priced.lines[index],
      })),
      shippingAddress: {
        fullName: 'Priya Shah',
        phone: '9800000000',
        addressLine1: '4 Lake View',
        city: 'Surat',
        state: 'Gujarat',
        postalCode: '395007',
        country: 'India',
      },
      pricing: priced.pricing,
      payment: { method: 'RAZORPAY', status: 'PENDING' },
    });
  }

  it('accepts an order whose GST is inside its total', () => {
    const order = pricedDocument(0);
    assert.ok(order.pricing.tax > 0);
    assert.doesNotThrow(() => assertOrderTotalIntact(order));
  });

  it('accepts an order with a coupon spread across its lines', () => {
    assert.doesNotThrow(() => assertOrderTotalIntact(pricedDocument(301)));
  });

  it('refuses an order whose discount no longer matches its lines', () => {
    const order = pricedDocument(301);
    order.pricing.discount = 300;
    order.pricing.total = order.pricing.subtotal - 300 + order.pricing.shipping;

    assert.throws(() => assertOrderTotalIntact(order), /no longer available for payment/);
  });

  it('refuses an order whose total was edited', () => {
    const order = pricedDocument(0);
    order.pricing.total = 1;

    assert.throws(() => assertOrderTotalIntact(order), /no longer available for payment/);
  });
});
