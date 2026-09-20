import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, MessageSquare, Package, Undo2 } from 'lucide-react';
import { CancelReturnButton } from '@/components/order/cancel-return-button';
import { ReturnStatusBadge } from '@/components/order/return-status-badge';
import { ReturnTimeline } from '@/components/order/return-timeline';
import { ApiError } from '@/services/api';
import { getReturnByRef } from '@/services/return.service';
import { getSessionCookie, getSessionUser } from '@/lib/server-auth';
import { formatDate, formatPrice } from '@/lib/format';
import { RETURN_REASON_LABEL, RETURN_STATUS_COPY } from '@/types/fulfillment';

export const dynamic = 'force-dynamic';

/** Static, for the same reason the order page's is: it may be a not-found. */
export const metadata: Metadata = {
  title: 'Return request',
  description: 'Your ZyCart return request.',
};

/**
 * One return request, for the customer who raised it.
 *
 * ## What this page will not show
 *
 * The internal note. The operator who reviewed it. The gateway refund id. None
 * of those are on the payload at all — the server builds the customer shape by
 * naming its fields rather than by deleting the private ones, so there is
 * nothing here to accidentally render.
 *
 * What the customer does get is the decision and the *reason* for it, which is
 * the part that matters: a rejection with no explanation is the worst thing
 * this workflow could produce, and the server refuses to record one.
 */
export default async function ReturnDetailPage({
  params,
}: PageProps<'/account/returns/[returnNumber]'>) {
  const { returnNumber } = await params;

  const user = await getSessionUser();
  if (!user) redirect(`/login?redirect=/account/returns/${returnNumber}`);

  let request;
  try {
    request = await getReturnByRef(returnNumber, { cookie: await getSessionCookie() });
  } catch (error) {
    // Somebody else's return and a nonexistent one look identical here.
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  }

  const copy = RETURN_STATUS_COPY[request.status];

  const value = request.items.reduce(
    (sum, item) => sum + item.unitPrice * (item.approvedQuantity ?? item.requestedQuantity),
    0,
  );

  return (
    <div>
      <Link
        href="/account/returns"
        className="focus-ring text-small inline-flex items-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All returns
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-h3 break-all">{request.returnNumber}</h2>
          <p className="text-small mt-1.5 text-muted-foreground">
            From order{' '}
            <Link
              href={`/account/orders/${request.orderNumber}`}
              className="focus-ring rounded-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {request.orderNumber}
            </Link>{' '}
            · requested {formatDate(request.requestedAt)}
          </p>
        </div>

        <ReturnStatusBadge status={request.status} className="mt-1" />
      </header>

      {/* The next step, stated before anything else. A status tells somebody
          where their request is; this tells them whether they need to act. */}
      <p
        className="text-small mt-6 rounded-2xl border border-brand/30 bg-brand-subtle/20 p-5 text-pretty"
        aria-live="polite"
      >
        {copy.next}
      </p>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <div className="space-y-8">
          <section aria-labelledby="return-items-heading">
            <h3 id="return-items-heading" className="text-h4">
              Items
            </h3>

            <ul className="mt-4 divide-y divide-border border-y border-border">
              {request.items.map((item) => {
                const variant = [item.selectedColor, item.selectedSize].filter(Boolean).join(' · ');
                const approved = item.approvedQuantity;

                return (
                  <li key={item.id} className="flex gap-4 py-4">
                    <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface">
                      {item.productImage && (
                        <Image
                          src={item.productImage}
                          alt=""
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-small font-medium">{item.productName}</p>
                      <p className="text-caption mt-0.5 text-muted-foreground">
                        {variant ? `${variant} · ` : ''}SKU {item.sku}
                      </p>

                      <p className="text-caption mt-2 text-muted-foreground">
                        Quantity:{' '}
                        <span className="font-medium text-foreground">
                          {approved ?? item.requestedQuantity}
                        </span>
                        {/* Shown only when the two differ, so a customer whose
                            request was partly approved learns it here rather
                            than from a refund that is smaller than expected. */}
                        {approved !== null && approved !== item.requestedQuantity && (
                          <span> — you asked for {item.requestedQuantity}</span>
                        )}
                      </p>

                      <p className="text-caption text-muted-foreground">
                        Reason:{' '}
                        <span className="font-medium text-foreground">
                          {RETURN_REASON_LABEL[item.reason]}
                        </span>
                      </p>
                    </div>

                    <p className="text-small shrink-0 font-medium tabular-nums">
                      {formatPrice(item.unitPrice * (approved ?? item.requestedQuantity))}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="return-progress-heading">
            <h3 id="return-progress-heading" className="text-h4">
              Progress
            </h3>
            <div className="mt-4">
              <ReturnTimeline request={request} />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border p-5">
            <h3 className="text-small flex items-center gap-2 font-semibold">
              <Undo2 className="size-4 text-muted-foreground" aria-hidden />
              Refund
            </h3>

            {request.refund.amount > 0 ? (
              <>
                <p className="text-price mt-3 tabular-nums">
                  {formatPrice(request.refund.amount)}
                </p>
                <p className="text-caption mt-1.5 text-pretty text-muted-foreground">
                  {request.refund.completedAt
                    ? `Completed on ${formatDate(request.refund.completedAt)}. It goes back to the way you paid.`
                    : request.refund.pending
                      ? 'Sent to your bank. Refunds usually land within 5 to 7 working days.'
                      : 'Confirmed and being processed.'}
                </p>
              </>
            ) : (
              <p className="text-caption mt-2.5 text-pretty text-muted-foreground">
                {/* No figure until there is one to state. A refund amount is
                    decided when the items are checked in, and showing ₹0 before
                    that would read as a decision nobody has made. */}
                {request.status === 'REJECTED'
                  ? 'No refund, because this request was not approved.'
                  : request.status === 'CANCELLED'
                    ? 'No refund — you withdrew this request.'
                    : `Confirmed once we have the items back. These are worth ${formatPrice(value)} on your order.`}
              </p>
            )}
          </div>

          {/* The operator's explanation, written for the customer. Their private
              note is not on this payload at all. */}
          {request.resolutionNote && (
            <div className="rounded-2xl border border-border p-5">
              <h3 className="text-small flex items-center gap-2 font-semibold">
                <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
                From our team
              </h3>
              <p className="text-caption mt-2.5 text-pretty">{request.resolutionNote}</p>
            </div>
          )}

          {request.customerNote && (
            <div className="rounded-2xl border border-border p-5">
              <h3 className="text-small font-semibold">Your note</h3>
              <p className="text-caption mt-2.5 text-pretty text-muted-foreground">
                {request.customerNote}
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-border p-5">
            <h3 className="text-small flex items-center gap-2 font-semibold">
              <Package className="size-4 text-muted-foreground" aria-hidden />
              Order
            </h3>
            <p className="text-caption mt-2.5 text-muted-foreground">
              This return is part of order{' '}
              <Link
                href={`/account/orders/${request.orderNumber}`}
                className="focus-ring rounded-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                {request.orderNumber}
              </Link>
              .
            </p>
          </div>

          {/* Offered only when the server said so. Once the goods are checked
              in, withdrawing would mean claiming we are not holding something
              we are. */}
          {request.canCancel && (
            <div className="rounded-2xl border border-border p-5">
              <h3 className="text-small font-semibold">Changed your mind?</h3>
              <p className="text-caption mt-1.5 mb-4 text-pretty text-muted-foreground">
                You can withdraw this request while the items are still with you.
              </p>
              <CancelReturnButton returnNumber={request.returnNumber} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
