import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, FileX } from 'lucide-react';
import { InvoiceDocument } from '@/components/invoice/invoice-document';
import { PrintButton } from '@/components/invoice/print-button';
import { ApiError } from '@/services/api';
import { getOrderInvoice as getAdminOrderInvoice } from '@/services/admin.service';
import { getOrderInvoice } from '@/services/order.service';
import { getSessionToken, getSessionUser } from '@/lib/server-auth';
import type { Invoice } from '@/types/invoice';

export const dynamic = 'force-dynamic';

/** Static, for the same reason the order page's is: see there. */
export const metadata: Metadata = {
  title: 'Invoice',
  description: 'A ZyCart tax invoice.',
};

/**
 * One tax invoice, on a page of its own.
 *
 * ## Why it sits outside the storefront and the console
 *
 * It is a document meant to be printed, and both of those layouts bring chrome
 * — a navbar, a sidebar — that would have to be hidden from the printer one
 * element at a time. The root layout brings none, so this route renders the
 * invoice and two buttons, and the buttons hide themselves on paper.
 *
 * ## Who can open it
 *
 * The signed-in owner of the order, through the customer endpoint whose
 * ownership check makes another customer's invoice simply not found — and an
 * administrator, through the admin endpoint. Which one is asked is decided by
 * the verified session's role, not by anything in the URL.
 */
export default async function InvoicePage({ params }: PageProps<'/invoice/[orderRef]'>) {
  const { orderRef } = await params;

  const user = await getSessionUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/invoice/${orderRef}`)}`);

  const admin = user.role === 'ADMIN';
  const options = { token: await getSessionToken() };
  const backHref = admin
    ? `/admin/orders/${encodeURIComponent(orderRef)}`
    : `/account/orders/${encodeURIComponent(orderRef)}`;

  let invoice: Invoice;

  try {
    invoice = admin
      ? await getAdminOrderInvoice(orderRef, options)
      : await getOrderInvoice(orderRef, options);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();

    // Not shipped yet, or placed before invoices existed: the server says
    // which, and the page says it back rather than showing an error screen.
    if (error instanceof ApiError && error.status === 409) {
      return <Unavailable message={error.message} backHref={backHref} />;
    }

    throw error;
  }

  return (
    <main className="flex-1 bg-muted/40 px-4 py-8 sm:py-12 print:bg-white print:p-0">
      <div className="mx-auto mb-6 flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={backHref}
          className="focus-ring text-small inline-flex items-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to the order
        </Link>
        <PrintButton />
      </div>

      <InvoiceDocument invoice={invoice} />
    </main>
  );
}

function Unavailable({ message, backHref }: { message: string; backHref: string }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <FileX className="size-6" aria-hidden />
        </span>
        <h1 className="text-h3 mt-5">No invoice yet</h1>
        <p className="text-small mt-2 text-pretty text-muted-foreground">{message}</p>
        <Link
          href={backHref}
          className="focus-ring text-small mt-6 inline-flex items-center gap-1.5 rounded-md font-medium text-brand hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to the order
        </Link>
      </div>
    </main>
  );
}
