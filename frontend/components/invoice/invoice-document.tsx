import { formatDate, formatExactPrice, formatRate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Invoice, InvoiceParty } from '@/types/invoice';

/**
 * A tax invoice, laid out for paper.
 *
 * ## It does no arithmetic
 *
 * Every figure — each line's taxable value and tax, the CGST/SGST or IGST
 * split, the totals, the amount in words — was computed on the server from the
 * order's own snapshot, in integer paise, so the columns add up exactly. This
 * component decides only where each number goes.
 *
 * ## Why the palette is fixed
 *
 * The rest of the storefront follows the theme. An invoice does not: it is a
 * document that gets printed, emailed to an accountant and filed, and the same
 * black on white in every theme is what makes the screen a faithful preview of
 * the paper. Hence the literal zinc palette rather than design tokens.
 */
export function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const intraState = invoice.supplyType === 'INTRA_STATE';

  return (
    <article className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-sm sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-zinc-200 pb-6">
        <Party party={invoice.seller} heading={null} emphasise />

        <div className="text-right">
          <h1 className="text-xl font-bold tracking-tight">
            {invoice.document === 'TAX_INVOICE' ? 'Tax Invoice' : 'Invoice'}
          </h1>
          <dl className="mt-3 space-y-0.5 text-sm">
            <Fact label="Invoice no.">{invoice.invoiceNumber}</Fact>
            <Fact label="Invoice date">{formatDate(invoice.invoiceDate)}</Fact>
            <Fact label="Order no.">{invoice.orderNumber}</Fact>
            <Fact label="Order date">{formatDate(invoice.orderDate)}</Fact>
          </dl>
        </div>
      </header>

      <section className="grid gap-6 border-b border-zinc-200 py-6 sm:grid-cols-2">
        <Party party={invoice.buyer} heading="Billed and shipped to" phone={invoice.buyer.phone} />

        <dl className="space-y-1 text-sm sm:text-right">
          <Fact label="Place of supply">{invoice.placeOfSupply}</Fact>
          <Fact label="Supply">{intraState ? 'Within the state' : 'Between states'}</Fact>
          <Fact label="Reverse charge">No</Fact>
          <Fact label="Payment">
            {invoice.paymentMethod === 'COD' ? 'Cash on delivery' : 'Paid online'}
          </Fact>
        </dl>
      </section>

      {/* Scrolls sideways on a phone rather than squeezing ten columns into
          it; on paper the page is wide enough and nothing scrolls. */}
      <div className="-mx-6 overflow-x-auto px-6 py-6 sm:mx-0 sm:px-0 print:overflow-visible">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-600">
              <th className="py-2 pr-3 font-semibold">Item</th>
              <th className="px-2 py-2 font-semibold">HSN</th>
              <th className="px-2 py-2 text-right font-semibold">Qty</th>
              <th className="px-2 py-2 text-right font-semibold">Amount</th>
              <th className="px-2 py-2 text-right font-semibold">Discount</th>
              <th className="px-2 py-2 text-right font-semibold">Taxable</th>
              <th className="px-2 py-2 text-right font-semibold">GST</th>
              {intraState ? (
                <>
                  <th className="px-2 py-2 text-right font-semibold">CGST</th>
                  <th className="px-2 py-2 text-right font-semibold">SGST</th>
                </>
              ) : (
                <th className="px-2 py-2 text-right font-semibold">IGST</th>
              )}
              <th className="py-2 pl-2 text-right font-semibold">Total</th>
            </tr>
          </thead>

          <tbody>
            {invoice.lines.map((line, index) => (
              <tr
                key={`${line.sku}-${String(index)}`}
                className="border-b border-zinc-200 align-top"
              >
                <td className="py-2.5 pr-3">
                  <span className="font-medium">{line.description}</span>
                  <span className="block text-xs text-zinc-500">
                    {[line.variant, `SKU ${line.sku}`].filter(Boolean).join(' · ')}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {formatExactPrice(line.unitPrice)} each, GST included
                  </span>
                </td>
                <td className="px-2 py-2.5 text-zinc-600">{line.hsnCode || '—'}</td>
                <Num>{line.quantity}</Num>
                <Num>{formatExactPrice(line.amount)}</Num>
                <Num>{line.discount > 0 ? `−${formatExactPrice(line.discount)}` : '—'}</Num>
                <Num>{formatExactPrice(line.taxableValue)}</Num>
                <Num>{formatRate(line.gstRate)}</Num>
                {intraState ? (
                  <>
                    <Num>{formatExactPrice(line.cgst)}</Num>
                    <Num>{formatExactPrice(line.sgst)}</Num>
                  </>
                ) : (
                  <Num>{formatExactPrice(line.igst)}</Num>
                )}
                <Num strong>{formatExactPrice(line.total)}</Num>
              </tr>
            ))}

            {invoice.shipping && (
              <tr className="border-b border-zinc-200 align-top">
                <td className="py-2.5 pr-3 font-medium">Delivery charges</td>
                <td className="px-2 py-2.5 text-zinc-600">—</td>
                <Num>1</Num>
                <Num>{formatExactPrice(invoice.shipping.amount)}</Num>
                <Num>—</Num>
                <Num>{formatExactPrice(invoice.shipping.taxableValue)}</Num>
                <Num>{formatRate(invoice.shipping.gstRate)}</Num>
                {intraState ? (
                  <>
                    <Num>{formatExactPrice(invoice.shipping.cgst)}</Num>
                    <Num>{formatExactPrice(invoice.shipping.sgst)}</Num>
                  </>
                ) : (
                  <Num>{formatExactPrice(invoice.shipping.igst)}</Num>
                )}
                <Num strong>{formatExactPrice(invoice.shipping.amount)}</Num>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Amount in words
          </p>
          <p className="mt-1 font-medium">{invoice.amountInWords}</p>
          {invoice.couponCode && (
            <p className="mt-3 text-xs text-zinc-500">
              Coupon {invoice.couponCode} applied; its discount is shared across the items above.
            </p>
          )}
        </div>

        <dl className="w-full space-y-1 text-sm sm:w-72">
          <Total label="Taxable value">{formatExactPrice(invoice.totals.taxableValue)}</Total>
          {intraState ? (
            <>
              <Total label="CGST">{formatExactPrice(invoice.totals.cgst)}</Total>
              <Total label="SGST">{formatExactPrice(invoice.totals.sgst)}</Total>
            </>
          ) : (
            <Total label="IGST">{formatExactPrice(invoice.totals.igst)}</Total>
          )}
          <Total label="Total tax">{formatExactPrice(invoice.totals.tax)}</Total>
          <div className="mt-2 flex items-baseline justify-between border-t-2 border-zinc-900 pt-2">
            <dt className="font-semibold">Invoice total</dt>
            <dd className="text-lg font-bold tabular-nums">
              {formatExactPrice(invoice.totals.grandTotal)}
            </dd>
          </div>
        </dl>
      </section>

      <footer className="mt-10 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
        Prices include GST. This invoice was generated from order {invoice.orderNumber} as it was
        recorded at purchase.
        {invoice.document === 'INVOICE' &&
          ' The seller has not provided a GSTIN, so this is not a tax invoice.'}
      </footer>
    </article>
  );
}

function Party({
  party,
  heading,
  phone,
  emphasise,
}: {
  party: InvoiceParty;
  heading: string | null;
  phone?: string;
  emphasise?: boolean;
}) {
  return (
    <div className="text-sm">
      {heading && (
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{heading}</p>
      )}
      <p className={cn(emphasise ? 'text-lg font-bold' : 'mt-1 font-semibold')}>{party.name}</p>
      <address className="mt-1 space-y-0.5 text-zinc-600 not-italic">
        {party.address.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {party.state && <p>State: {party.state}</p>}
        {phone && <p>Phone: {phone}</p>}
        {party.gstin && <p className="font-medium text-zinc-900">GSTIN: {party.gstin}</p>}
      </address>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 sm:justify-end">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Num({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <td className={cn('px-2 py-2.5 text-right tabular-nums last:pr-0', strong && 'font-semibold')}>
      {children}
    </td>
  );
}

function Total({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-zinc-600">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}
