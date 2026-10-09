import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Boxes, CreditCard, History, Lock, Package, User } from 'lucide-react';
import { AdminError, AdminPageHeader, StatusBadge } from '@/components/admin/admin-ui';
import { ReturnActions } from '@/components/admin/return-actions';
import {
  humanise,
  orderStatusTone,
  paymentStatusTone,
  returnStatusTone,
} from '@/components/admin/status-tones';
import { ApiError, toErrorMessage } from '@/services/api';
import { getReturn } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';
import { formatDate, formatDateTime, formatPrice } from '@/lib/format';
import { RETURN_ADMIN_LABEL, RETURN_REASON_LABEL } from '@/types/fulfillment';
import type { AdminReturnDetail } from '@/types/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Return' };

/**
 * One return, for an operator.
 *
 * ## What is on this page that is not on the customer's
 *
 * The internal note, who reviewed it, the gateway refund id, the resellable
 * judgement, and the server's verdict on whether a refund can be issued. Every
 * one of those is operational detail the customer has no use for and, in the
 * case of the internal note, should not see.
 *
 * ## What is not on this page
 *
 * Anything that would let an operator write an outcome rather than record one.
 * There is no free-text status field, no refund amount input and no way to mark
 * a pending refund settled — the amount is computed from the order's snapshot
 * and the settlement is a fact at Razorpay. Every control here goes through a
 * transition the server validates.
 */
export default async function AdminReturnPage({ params }: PageProps<'/admin/returns/[returnRef]'>) {
  const { returnRef } = await params;

  let request: AdminReturnDetail;
  try {
    request = await getReturn(returnRef, { token: await getSessionToken() });
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();

    return (
      <>
        <AdminPageHeader title="Return" back={{ href: '/admin/returns', label: 'Returns' }} />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  const value = request.items.reduce(
    (sum, item) => sum + item.unitPrice * (item.approvedQuantity ?? item.requestedQuantity),
    0,
  );

  return (
    <>
      <AdminPageHeader
        title={request.returnNumber}
        description={`Requested ${formatDate(request.requestedAt)} · ${request.itemCount} ${request.itemCount === 1 ? 'item' : 'items'} · ${formatPrice(value)}`}
        back={{ href: '/admin/returns', label: 'Returns' }}
        action={
          <StatusBadge tone={returnStatusTone(request.status)} className="self-center">
            {RETURN_ADMIN_LABEL[request.status]}
          </StatusBadge>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Panel title="Items" icon={Package}>
            <ul className="divide-y divide-border">
              {request.items.map((item) => {
                const variant = [item.selectedColor, item.selectedSize].filter(Boolean).join(' · ');
                const approved = item.approvedQuantity;

                return (
                  <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-background">
                      {item.productImage && (
                        <Image
                          src={item.productImage}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-small font-medium">{item.productName}</p>
                      <p className="text-caption text-muted-foreground">
                        {variant ? `${variant} · ` : ''}SKU {item.sku}
                      </p>
                      <p className="text-caption mt-1">
                        <span className="text-muted-foreground">Reason: </span>
                        {RETURN_REASON_LABEL[item.reason]}
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {/* Requested and approved are both shown, always. The
                            refund is computed from the approved figure, so an
                            operator reconciling an amount needs to see both. */}
                        Requested {item.requestedQuantity} of {item.purchasedQuantity} bought
                        {approved !== null && ` · approved ${approved}`}
                      </p>
                    </div>

                    <p className="text-small shrink-0 font-medium tabular-nums">
                      {formatPrice(item.unitPrice * (approved ?? item.requestedQuantity))}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {request.customerNote && (
            <Panel title="What the customer said">
              <p className="text-small text-pretty">{request.customerNote}</p>
            </Panel>
          )}

          <Panel title="History" icon={History}>
            <Timeline request={request} />
          </Panel>

          <Panel title="Inventory" icon={Boxes}>
            {/* Stated plainly, because "did these go back on the shelf?" is the
                question, and the answer is deliberately not automatic. */}
            <p className="text-caption text-pretty text-muted-foreground">
              {request.resellable === null
                ? 'Nothing has been decided yet. When you mark the goods received you will be asked whether they can be sold again — nothing goes back into stock until then.'
                : request.resellable
                  ? request.restocked
                    ? 'These units were judged resellable and have been returned to stock. A RETURN movement is on each product’s inventory ledger.'
                    : 'These units were judged resellable, but no catalogue row remained to credit — the products have since been deleted.'
                  : 'These units were not resellable, so stock was left untouched. ZyCart does not track returned-but-unsellable inventory as a separate pool.'}
            </p>
          </Panel>
        </div>

        <div className="space-y-4">
          <ReturnActions request={request} />

          <Panel title="Refund" icon={CreditCard}>
            <dl className="space-y-2">
              <Row label="Amount">{formatPrice(request.refundPlan.amount)}</Row>
              <Row label="Left on order">{formatPrice(request.refundPlan.remainingOnOrder)}</Row>
              {request.refund.initiatedAt && (
                <Row label="Sent">{formatDate(request.refund.initiatedAt)}</Row>
              )}
              {request.refund.completedAt && (
                <Row label="Settled">{formatDate(request.refund.completedAt)}</Row>
              )}
            </dl>

            {/* A gateway reference, which is what support quotes. Useless to
                anyone without the API secret, exactly like a payment id. */}
            {request.refundDetail.razorpayRefundId && (
              <p className="text-caption mt-3 break-all border-t border-border pt-3 text-muted-foreground">
                Refund {request.refundDetail.razorpayRefundId}
              </p>
            )}

            {request.refundDetail.initiatedByName && (
              <p className="text-caption mt-1 text-muted-foreground">
                Started by {request.refundDetail.initiatedByName}
              </p>
            )}

            <p className="text-caption mt-3 text-pretty text-muted-foreground">
              Worked out from the approved quantities at the prices on the original order. Shipping
              is never refunded.
            </p>
          </Panel>

          <Panel title="Order" icon={Package}>
            {request.order ? (
              <>
                <Link
                  href={`/admin/orders/${request.order.orderNumber}`}
                  className="focus-ring text-small block rounded-sm font-medium break-all hover:underline"
                >
                  {request.order.orderNumber}
                </Link>

                <dl className="mt-3 space-y-2">
                  <Row label="Order">
                    <StatusBadge tone={orderStatusTone(request.order.status)}>
                      {humanise(request.order.status)}
                    </StatusBadge>
                  </Row>
                  <Row label="Payment">
                    <StatusBadge tone={paymentStatusTone(request.order.paymentStatus)}>
                      {humanise(request.order.paymentStatus)}
                    </StatusBadge>
                  </Row>
                  <Row label="Method">
                    {request.order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Razorpay'}
                  </Row>
                  <Row label="Total">{formatPrice(request.order.total)}</Row>
                  {request.order.refundedAmount > 0 && (
                    <Row label="Refunded">{formatPrice(request.order.refundedAmount)}</Row>
                  )}
                  <Row label="Delivered">
                    {request.order.deliveredAt ? (
                      formatDate(request.order.deliveredAt)
                    ) : (
                      <span className="font-normal text-muted-foreground">Not recorded</span>
                    )}
                  </Row>
                </dl>
              </>
            ) : (
              <p className="text-caption text-muted-foreground">
                The order behind this return no longer exists.
              </p>
            )}
          </Panel>

          <Panel title="Customer" icon={User}>
            {request.customer?.id ? (
              <>
                <Link
                  href={`/admin/customers/${request.customer.id}`}
                  className="focus-ring text-small block rounded-sm font-medium hover:underline"
                >
                  {request.customer.name}
                </Link>
                <p className="text-caption mt-0.5 break-all text-muted-foreground">
                  {request.customer.email}
                </p>
              </>
            ) : (
              <p className="text-caption text-muted-foreground">
                This account no longer exists. The return keeps its own copy of what was sent back.
              </p>
            )}
          </Panel>

          {/* Two notes, kept visibly apart. The one the customer reads is
              labelled as such; the internal one is labelled as never leaving
              this screen, so nobody writes the wrong thing in the wrong box. */}
          {request.resolutionNote && (
            <Panel title="Shown to the customer">
              <p className="text-small text-pretty">{request.resolutionNote}</p>
            </Panel>
          )}

          {request.adminNote && (
            <Panel title="Internal note" icon={Lock}>
              <p className="text-small text-pretty">{request.adminNote}</p>
              <p className="text-caption mt-2 text-muted-foreground">
                Staff only. This is never sent to the customer.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * The return's history, from stored timestamps only.
 *
 * Nothing is synthesised. A request that was never decided shows no decision
 * row rather than an empty one, and a refund that has not settled shows no
 * settlement date.
 */
function Timeline({ request }: { request: AdminReturnDetail }) {
  const events: { at: string; label: string; detail?: string }[] = [
    { at: request.requestedAt, label: 'Requested by the customer' },
  ];

  if (request.decidedAt) {
    events.push({
      at: request.decidedAt,
      label: request.status === 'REJECTED' ? 'Rejected' : 'Approved',
      detail: request.reviewedByName ? `by ${request.reviewedByName}` : undefined,
    });
  }

  if (request.receivedAt) {
    events.push({
      at: request.receivedAt,
      label: 'Goods received',
      detail: request.resellable ? 'Judged resellable' : 'Not resellable',
    });
  }

  if (request.refundDetail.failedAt) {
    events.push({
      at: request.refundDetail.failedAt,
      label: 'Refund attempt failed',
      detail: request.refundDetail.failureReason ?? undefined,
    });
  }

  if (request.refund.initiatedAt) {
    events.push({
      at: request.refund.initiatedAt,
      label: 'Refund sent to Razorpay',
      detail: request.refundDetail.initiatedByName
        ? `by ${request.refundDetail.initiatedByName}`
        : undefined,
    });
  }

  if (request.refund.completedAt) {
    events.push({ at: request.refund.completedAt, label: 'Refund settled' });
  }

  if (request.cancelledAt) {
    events.push({ at: request.cancelledAt, label: 'Withdrawn by the customer' });
  }

  events.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <ol className="space-y-0">
      {events.map((event, index) => (
        <li key={`${event.at}-${String(index)}`} className="flex gap-3">
          <span aria-hidden className="flex flex-col items-center">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
            {index < events.length - 1 && <span className="w-px flex-1 bg-border" />}
          </span>

          <span className="min-w-0 flex-1 pb-4 last:pb-0">
            <span className="text-small block font-medium">{event.label}</span>
            <span className="text-caption block text-muted-foreground">
              {formatDateTime(event.at)}
              {event.detail ? ` · ${event.detail}` : ''}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface/40 p-5">
      <h2 className="text-small flex items-center gap-2 font-semibold">
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-small flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}
