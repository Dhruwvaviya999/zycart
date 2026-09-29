/**
 * The tax invoice, exactly as `GET /api/orders/:ref/invoice` returns it.
 *
 * Every figure was computed on the server from the order's own snapshot. The
 * page lays these numbers out and does no arithmetic of its own, so what is
 * printed and what was charged cannot disagree.
 */

export interface InvoiceTaxSplit {
  cgst: number;
  sgst: number;
  igst: number;
}

export interface InvoiceLine extends InvoiceTaxSplit {
  description: string;
  variant: string;
  sku: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  discount: number;
  taxableValue: number;
  gstRate: number;
  total: number;
}

export interface InvoiceParty {
  name: string;
  address: string[];
  gstin: string | null;
  state: string;
}

export interface Invoice {
  document: 'TAX_INVOICE' | 'INVOICE';
  invoiceNumber: string;
  invoiceDate: string;
  orderNumber: string;
  orderDate: string;
  seller: InvoiceParty;
  buyer: InvoiceParty & { phone: string };
  placeOfSupply: string;
  supplyType: 'INTRA_STATE' | 'INTER_STATE';
  lines: InvoiceLine[];
  shipping: (InvoiceTaxSplit & { amount: number; taxableValue: number; gstRate: number }) | null;
  couponCode: string | null;
  totals: InvoiceTaxSplit & {
    gross: number;
    discount: number;
    taxableValue: number;
    tax: number;
    grandTotal: number;
  };
  amountInWords: string;
  paymentMethod: string;
  paymentStatus: string;
}
