import mongoose from 'mongoose';
import type { Env } from '../../config/env';
import { Order } from '../../models/order.model';
import { AppError } from '../../utils/AppError';
import {
  findOrderByRef,
  findOwnedOrder,
  hasTaxBreakdown,
  invoiceAvailable,
} from '../order.service';
import { resolveState, stateOfGstin, type IndianState } from './indian-states';
import { nextInvoiceNumber } from './invoice-number';

/**
 * The tax invoice for one order, assembled from what the order recorded.
 *
 * ## Nothing on it is recomputed
 *
 * Every figure comes from the order: the unit prices and line totals from its
 * snapshot, the discount shares and the taxable value and tax of each line from
 * the `priceOrder` call that produced the total the customer paid, the delivery
 * charge and its tax from the stored pricing. Today's catalogue, today's GST
 * rates and today's coupon rules are never consulted — an invoice is a record
 * of a sale that has happened, and a document that changed when a category's
 * rate did would be worthless as one.
 *
 * The only thing derived here is the *split* of each tax figure into its
 * components — CGST and SGST for a sale within the seller's state, IGST for
 * one outside it — because that follows from two addresses rather than from
 * any arithmetic the checkout did.
 *
 * ## Paise
 *
 * All of it is done in integer paise and converted once at the end, so the
 * columns add up exactly: the sum of the lines is the total, to the paisa,
 * rather than to within floating-point noise.
 */

export type SupplyType = 'INTRA_STATE' | 'INTER_STATE';

export interface InvoiceTaxSplit {
  cgst: number;
  sgst: number;
  igst: number;
}

export interface InvoiceLine extends InvoiceTaxSplit {
  description: string;
  /** "Size 9 · Black", or empty. */
  variant: string;
  sku: string;
  hsnCode: string;
  quantity: number;
  /** GST-inclusive, as sold. */
  unitPrice: number;
  /** Unit price × quantity. */
  amount: number;
  discount: number;
  taxableValue: number;
  gstRate: number;
  /** What the line cost after discount, tax included. */
  total: number;
}

export interface InvoiceParty {
  name: string;
  address: string[];
  gstin: string | null;
  /** "Gujarat (24)", or the state as written when it is not a known one. */
  state: string;
}

export interface InvoiceView {
  /** "TAX_INVOICE" only when the seller has a GSTIN to issue one under. */
  document: 'TAX_INVOICE' | 'INVOICE';
  invoiceNumber: string;
  invoiceDate: string;
  orderNumber: string;
  orderDate: string;
  seller: InvoiceParty;
  buyer: InvoiceParty & { phone: string };
  placeOfSupply: string;
  supplyType: SupplyType;
  lines: InvoiceLine[];
  /** Null when delivery was free. */
  shipping:
    | (InvoiceTaxSplit & {
        amount: number;
        taxableValue: number;
        gstRate: number;
      })
    | null;
  couponCode: string | null;
  totals: InvoiceTaxSplit & {
    /** Σ line amounts, before discount. */
    gross: number;
    discount: number;
    taxableValue: number;
    tax: number;
    /** What the customer paid, or will pay on delivery. Whole rupees. */
    grandTotal: number;
  };
  amountInWords: string;
  paymentMethod: string;
  paymentStatus: string;
}

type OrderDoc = InstanceType<typeof Order>;

const toPaise = (rupees: number | null | undefined): number => Math.round((rupees ?? 0) * 100);
const toRupees = (paise: number): number => paise / 100;

/**
 * One tax figure, split for the kind of supply.
 *
 * Within a state the tax is shared equally between the Centre and the State;
 * an odd paisa goes to CGST, so the two halves always sum to the whole rather
 * than each being rounded on its own and missing it by one.
 */
export function splitTax(taxPaise: number, supplyType: SupplyType): InvoiceTaxSplit {
  if (supplyType === 'INTER_STATE') return { cgst: 0, sgst: 0, igst: toRupees(taxPaise) };

  const cgst = Math.ceil(taxPaise / 2);
  return { cgst: toRupees(cgst), sgst: toRupees(taxPaise - cgst), igst: 0 };
}

/* ---------------------------------------------------------------- */
/* Amount in words                                                   */
/* ---------------------------------------------------------------- */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(value: number): string {
  if (value < 20) return ONES[value] ?? '';

  const tens = TENS[Math.floor(value / 10)] ?? '';
  const ones = ONES[value % 10] ?? '';
  return ones ? `${tens}-${ones}` : tens;
}

function belowThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;

  return [hundreds ? `${ONES[hundreds] ?? ''} Hundred` : '', rest ? belowHundred(rest) : '']
    .filter(Boolean)
    .join(' ');
}

/** Words in the Indian system — thousand, lakh, crore — as an invoice states them. */
function inWords(value: number): string {
  if (value === 0) return 'Zero';

  const crore = Math.floor(value / 10_000_000);
  const lakh = Math.floor((value % 10_000_000) / 100_000);
  const thousand = Math.floor((value % 100_000) / 1_000);
  const rest = value % 1_000;

  return [
    crore ? `${inWords(crore)} Crore` : '',
    lakh ? `${belowHundred(lakh)} Lakh` : '',
    thousand ? `${belowHundred(thousand)} Thousand` : '',
    rest ? belowThousand(rest) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** `1180` → "Rupees One Thousand One Hundred Eighty Only". Whole rupees only. */
export function rupeesInWords(rupees: number): string {
  return `Rupees ${inWords(Math.max(0, Math.floor(rupees)))} Only`;
}

/* ---------------------------------------------------------------- */
/* The seller                                                        */
/* ---------------------------------------------------------------- */

function sellerOf(env: Env): { party: InvoiceParty; state: IndianState | null } {
  const gstin = env.STORE_GSTIN ?? null;
  const state = stateOfGstin(gstin) ?? resolveState(env.STORE_STATE);

  return {
    party: {
      name: env.STORE_LEGAL_NAME,
      // `|` separates lines, because an environment variable cannot carry a
      // newline portably: "Plot 12, MG Road|Ahmedabad 380009".
      address: (env.STORE_ADDRESS ?? '')
        .split('|')
        .map((line) => line.trim())
        .filter(Boolean),
      gstin,
      state: state ? `${state.name} (${state.code})` : (env.STORE_STATE ?? ''),
    },
    state,
  };
}

/* ---------------------------------------------------------------- */
/* Issuing and building                                              */
/* ---------------------------------------------------------------- */

/**
 * Why there is no invoice for this order yet, in words for whoever asked.
 *
 * Checked before anything is numbered, so a request for an invoice that cannot
 * exist never draws a number from the series.
 */
function assertInvoiceable(order: OrderDoc): void {
  if (!hasTaxBreakdown(order)) {
    throw new AppError(
      'This order was placed before ZyCart issued GST invoices, so there is no tax invoice for ' +
        'it. Contact support if you need a copy of the bill.',
      409,
    );
  }

  if (!invoiceAvailable(order)) {
    throw new AppError('The invoice for this order is issued when it ships.', 409);
  }
}

/**
 * Makes sure an invoiceable order has its number.
 *
 * Every order shipped from Phase 18 was numbered in the transaction that
 * shipped it, so this nearly always returns at once. It exists for the order
 * that somehow reached SHIPPED without one, and it numbers it the same careful
 * way: inside a transaction that re-reads the order first, so two concurrent
 * requests cannot both draw a number — the second one's counter write conflicts
 * with the first's, and on retry it finds the order already numbered.
 */
async function ensureNumbered(order: OrderDoc): Promise<OrderDoc> {
  if (order.invoice?.number) return order;

  const session = await mongoose.startSession();

  try {
    let numbered: OrderDoc | null = null;

    await session.withTransaction(async () => {
      const current = await Order.findById(order._id).session(session);
      if (!current) throw new AppError('Order not found', 404);

      if (!current.invoice?.number) {
        current.set('invoice', { number: await nextInvoiceNumber(session), issuedAt: new Date() });
        await current.save({ session });
      }

      numbered = current;
    });

    if (!numbered) throw new AppError('Could not issue the invoice. Please try again.', 500);
    return numbered;
  } finally {
    await session.endSession();
  }
}

function variantOf(item: { selectedSize?: string | null; selectedColor?: string | null }): string {
  return [item.selectedSize ? `Size ${item.selectedSize}` : '', item.selectedColor ?? '']
    .filter(Boolean)
    .join(' · ');
}

/** Builds the invoice document for an order that has one. Pure over the order and config. */
export function buildInvoice(order: OrderDoc, env: Env): InvoiceView {
  const seller = sellerOf(env);
  const buyerState = resolveState(order.shippingAddress.state);

  /**
   * Intra-state only when both states are known and are the same. Anything
   * unresolvable is treated as inter-state — see `indian-states.ts` for why
   * that is the correctable direction to be wrong in.
   */
  const supplyType: SupplyType =
    seller.state && buyerState && seller.state.code === buyerState.code
      ? 'INTRA_STATE'
      : 'INTER_STATE';

  let taxableTotal = 0;
  let taxTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  const add = (taxablePaise: number, taxPaise: number): InvoiceTaxSplit => {
    const split = splitTax(taxPaise, supplyType);

    taxableTotal += taxablePaise;
    taxTotal += taxPaise;
    cgstTotal += toPaise(split.cgst);
    sgstTotal += toPaise(split.sgst);
    igstTotal += toPaise(split.igst);

    return split;
  };

  const lines: InvoiceLine[] = order.items.map((item) => {
    const discount = item.discountShare ?? 0;
    const taxablePaise = toPaise(item.taxableValue);
    const taxPaise = toPaise(item.taxAmount);

    return {
      description: item.productName,
      variant: variantOf(item),
      sku: item.sku,
      hsnCode: item.hsnCode ?? '',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.lineTotal,
      discount,
      taxableValue: toRupees(taxablePaise),
      gstRate: item.gstRate ?? 0,
      total: item.lineTotal - discount,
      ...add(taxablePaise, taxPaise),
    };
  });

  const shippingTaxPaise = toPaise(order.pricing.shippingTax);
  const shippingTaxablePaise = order.pricing.shipping * 100 - shippingTaxPaise;

  const shipping =
    order.pricing.shipping > 0
      ? {
          amount: order.pricing.shipping,
          taxableValue: toRupees(shippingTaxablePaise),
          gstRate: order.pricing.shippingGstRate ?? 0,
          ...add(shippingTaxablePaise, shippingTaxPaise),
        }
      : null;

  const address = order.shippingAddress;

  return {
    document: seller.party.gstin ? 'TAX_INVOICE' : 'INVOICE',
    invoiceNumber: order.invoice?.number ?? '',
    invoiceDate: (order.invoice?.issuedAt ?? new Date()).toISOString(),
    orderNumber: order.orderNumber,
    orderDate: order.createdAt.toISOString(),
    seller: seller.party,
    buyer: {
      name: address.fullName,
      address: [
        address.addressLine1,
        address.addressLine2,
        address.landmark ? `Near ${address.landmark}` : '',
        `${address.city} ${address.postalCode}`.trim(),
        address.country,
      ].filter(Boolean),
      gstin: null,
      state: buyerState ? `${buyerState.name} (${buyerState.code})` : address.state,
      phone: address.phone,
    },
    placeOfSupply: buyerState ? `${buyerState.name} (${buyerState.code})` : address.state,
    supplyType,
    lines,
    shipping,
    couponCode: order.coupon?.code ?? null,
    totals: {
      gross: order.pricing.subtotal,
      discount: order.pricing.discount,
      taxableValue: toRupees(taxableTotal),
      tax: toRupees(taxTotal),
      cgst: toRupees(cgstTotal),
      sgst: toRupees(sgstTotal),
      igst: toRupees(igstTotal),
      grandTotal: order.pricing.total,
    },
    amountInWords: rupeesInWords(order.pricing.total),
    paymentMethod: order.payment.method,
    paymentStatus: order.payment.status,
  };
}

/** The customer's own invoice. Ownership is part of the lookup, as for the order itself. */
export async function getCustomerInvoice(
  env: Env,
  userId: string,
  orderRef: string,
): Promise<InvoiceView> {
  const order = await findOwnedOrder(userId, orderRef);
  assertInvoiceable(order);

  return buildInvoice(await ensureNumbered(order), env);
}

/** Any order's invoice, for the console. Guarded by the admin namespace, not by ownership. */
export async function getAdminInvoice(env: Env, orderRef: string): Promise<InvoiceView> {
  const order = await findOrderByRef(orderRef);
  assertInvoiceable(order);

  return buildInvoice(await ensureNumbered(order), env);
}
