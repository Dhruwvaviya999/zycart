import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ArrowRight, FileText, MapPin, RotateCcw, Wallet } from 'lucide-react';
import { CancelOrderDialog } from '@/components/order/cancel-order-dialog';
import { EmailedUpdate } from '@/components/order/emailed-update';
import { ReturnRequestDialog } from '@/components/order/return-request-dialog';
import { ReturnStatusBadge } from '@/components/order/return-status-badge';
import { ShipmentCard } from '@/components/order/shipment-card';
import { PayNowButton } from '@/components/payment/pay-now-button';
import { OrderItemReview } from '@/components/reviews/order-item-review';
import {
  PaymentStatusBadge,
  paymentMethodLabel,
  paymentStatusExplanation,
} from '@/components/payment/payment-status';
import { OrderStatusBadge } from '@/components/order/order-status-badge';
import { OrderTimeline } from '@/components/order/order-timeline';
import { PriceBreakdown } from '@/components/order/price-breakdown';
import { ApiError } from '@/services/api';
import { getOrderById } from '@/services/order.service';
import { getSessionToken, getSessionUser } from '@/lib/server-auth';
import { formatDate, formatPrice } from '@/lib/format';
import type { Order } from '@/types/order';

export const dynamic = 'force-dynamic';

/**
 * Deliberately static. Echoing the URL's order number into the title would put
 * it on the tab of a page that may well be a not-found — asserting an order
 * exists to someone who cannot see it.
 */
export const metadata: Metadata = {
  title: 'Order details',
  description: 'Your ZyCart order.',
};

/**
 * One order, after the sale.
 *
 * ## What Phase 13 added, and the principle behind all of it
 *
 * Delivery, progress and returns — and every one of them is rendered from what
 * the server actually stored. The timeline carries no date nobody recorded, the
 * delivery panel names no carrier ZyCart was not told about, and the return
 * button appears only because the *server* said this order is returnable and
 * for which lines. The page asks; it never decides.
 *
 * ## Why the page is server-rendered on every request
 *
 * `force-dynamic`, and no polling. Shipment state changes when an operator
 * changes it, which is minutes or hours apart, so a websocket would be a
 * connection held open for an event that almost never comes. Navigating here,
 * or reloading, reads the truth — and the delivery panel carries the timestamps
 * that make it obvious how fresh that truth is.
 */
export default async function OrderDetailPage({
  params,
}: PageProps<'/account/orders/[orderNumber]'>) {
  const { orderNumber } = await params;

  const user = await getSessionUser();
  if (!user) redirect(`/login?redirect=/account/orders/${orderNumber}`);

  let order: Order;
  try {
    order = await getOrderById(orderNumber, { token: await getSessionToken() });
  } catch (error) {
    // Another customer's order and a nonexistent one are indistinguishable here,
    // which is exactly what the API intends.
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  }

  const address = order.shippingAddress;

  return (
    <div>
      <Link
        href="/account/orders"
        className="focus-ring text-small inline-flex items-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All orders
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-h3 break-all">{order.orderNumber}</h2>
          <p className="text-small mt-1.5 text-muted-foreground">
            Placed on {formatDate(order.createdAt)} · {order.itemCount}{' '}
            {order.itemCount === 1 ? 'item' : 'items'} · {formatPrice(order.pricing.total)}
          </p>
        </div>

        <OrderStatusBadge status={order.status} className="mt-1" />
      </header>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <div className="space-y-8">
          <section aria-labelledby="items-heading">
            <h3 id="items-heading" className="text-h4">
              Items
            </h3>

            <ul className="mt-4 divide-y divide-border border-y border-border">
              {order.items.map((item) => {
                const variant = [item.selectedColor, item.selectedSize].filter(Boolean).join(' · ');

                return (
                  <li key={item.id} className="flex gap-4 py-4">
                    <span className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface">
                      {item.productImage && (
                        <Image
                          src={item.productImage}
                          alt=""
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      )}
                    </span>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="text-caption text-muted-foreground">{item.brand}</p>

                      {/* Links to the product when it still exists, but the text
                          always comes from the snapshot. */}
                      <h4 className="text-small font-medium">
                        {item.productSlug ? (
                          <Link
                            href={`/products/${item.productSlug}`}
                            className="focus-ring rounded-sm"
                          >
                            {item.productName}
                          </Link>
                        ) : (
                          item.productName
                        )}
                      </h4>

                      <p className="text-caption mt-1 text-muted-foreground">
                        {variant ? `${variant} · ` : ''}SKU {item.sku}
                      </p>

                      <p className="text-caption mt-auto pt-2 text-muted-foreground">
                        {formatPrice(item.unitPrice)} × {item.quantity}
                        {/* Stated on the line itself, so a customer wondering why
                            they cannot return something does not have to open a
                            dialog to find out. */}
                        {item.returnedQuantity > 0 && (
                          <span className="ml-2">
                            · {item.returnedQuantity} of {item.quantity} in a return
                          </span>
                        )}
                      </p>

                      {/* Offered only on a delivered order, and only for a line
                          that still points at a product. The component asks the
                          server whether this customer may review before showing
                          anything, so the button never leads to a refusal. */}
                      {order.status === 'DELIVERED' && item.product && (
                        <OrderItemReview productId={item.product} productName={item.productName} />
                      )}
                    </div>

                    <p className="text-price shrink-0 tabular-nums">
                      {formatPrice(item.lineTotal)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="progress-heading">
            <h3 id="progress-heading" className="text-h4">
              Progress
            </h3>
            <div className="mt-4">
              <OrderTimeline order={order} />
            </div>

            {/* Only when a message was actually accepted by the mail provider.
                See `EmailedUpdate` for why that distinction is the point. */}
            <EmailedUpdate at={order.lastUpdateEmailedAt} />
          </section>

          {order.returns.length > 0 && (
            <section aria-labelledby="returns-heading">
              <h3 id="returns-heading" className="text-h4">
                Returns
              </h3>

              <ul className="mt-4 space-y-3">
                {order.returns.map((request) => (
                  <li key={request.id}>
                    <Link
                      href={`/account/returns/${request.returnNumber}`}
                      className="focus-ring flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4 transition-colors hover:border-foreground/25"
                    >
                      <div className="min-w-0">
                        <p className="text-small font-semibold break-all">
                          {request.returnNumber}
                        </p>
                        <p className="text-caption mt-0.5 text-muted-foreground">
                          {request.itemCount} {request.itemCount === 1 ? 'item' : 'items'} ·
                          requested {formatDate(request.requestedAt)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <ReturnStatusBadge status={request.status} />
                        <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          {/* Delivery sits above the money, because "where is my order?" is the
              question a post-purchase page is opened to answer. */}
          <ShipmentCard shipment={order.shipment} orderStatus={order.status} />

          <div className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="text-h4">Summary</h3>

            <PriceBreakdown
              pricing={order.pricing}
              couponCode={order.coupon?.code}
              className="mt-4"
            />

            {/* Only when money has actually come back. A partial refund would
                otherwise be invisible beside a "Paid" badge. */}
            {order.payment.refundedAmount > 0 && (
              <div className="text-small mt-3 flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-muted-foreground">Refunded</span>
                <span className="font-semibold tabular-nums text-success">
                  −{formatPrice(order.payment.refundedAmount)}
                </span>
              </div>
            )}

            <InvoiceLink order={order} />
          </div>

          <div className="rounded-2xl border border-border p-5">
            <h3 className="text-small flex items-center gap-2 font-semibold">
              <MapPin className="size-4 text-muted-foreground" aria-hidden />
              Delivery address
            </h3>
            <address className="text-caption mt-3 space-y-0.5 text-muted-foreground not-italic">
              <p className="text-foreground">{address.fullName}</p>
              <p>{address.addressLine1}</p>
              {address.addressLine2 && <p>{address.addressLine2}</p>}
              {address.landmark && <p>{address.landmark}</p>}
              <p>
                {address.city}, {address.state} {address.postalCode}
              </p>
              <p>{address.country}</p>
              <p className="pt-1">{address.phone}</p>
            </address>
          </div>

          <div className="rounded-2xl border border-border p-5">
            <h3 className="text-small flex items-center gap-2 font-semibold">
              <Wallet className="size-4 text-muted-foreground" aria-hidden />
              Payment
            </h3>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-caption text-muted-foreground">
                {paymentMethodLabel(order.payment.method)}
              </p>
              <PaymentStatusBadge status={order.payment.status} method={order.payment.method} />
            </div>

            <p className="text-caption mt-2 text-pretty text-muted-foreground">
              {paymentStatusExplanation(order.payment.status, order.payment.method)}
            </p>

            {order.payment.paidAt && (
              <p className="text-caption mt-1 text-muted-foreground">
                Paid on {formatDate(order.payment.paidAt)}
              </p>
            )}

            {/* Payment state and refund state are separate facts, and a partly
                refunded order is still, accurately, paid. Saying both keeps the
                badge honest without hiding the money that went back. */}
            {order.payment.refundedAmount > 0 &&
              order.payment.refundedAmount < order.pricing.total && (
                <p className="text-caption mt-1 text-pretty text-muted-foreground">
                  {formatPrice(order.payment.refundedAmount)} of this order has been refunded.
                </p>
              )}

            {order.payment.status === 'FAILED' && order.payment.failureReason && (
              <p className="text-caption mt-1 text-pretty text-muted-foreground">
                {order.payment.failureReason}
              </p>
            )}

            {/* The gateway reference, because it is what support will ask for.
                It is useless to anyone without the API secret. */}
            {order.payment.razorpayPaymentId && (
              <p className="text-caption mt-2 break-all text-muted-foreground">
                Reference {order.payment.razorpayPaymentId}
              </p>
            )}
          </div>

          {/* Offered only when the server says this order may still be paid,
              so the button and the endpoint behind it cannot disagree. */}
          {order.canPayNow && (
            <div className="rounded-2xl border border-brand/30 bg-brand-subtle/20 p-5">
              <h3 className="text-small font-semibold">This order is waiting for payment</h3>
              <p className="text-caption mt-1.5 mb-4 text-pretty text-muted-foreground">
                Nothing has been charged yet. Complete the payment and we will get it moving — your
                items are not reserved until it goes through.
              </p>
              <PayNowButton orderId={order.id} total={order.pricing.total} />
            </div>
          )}

          {order.canCancel && (
            <div className="rounded-2xl border border-border p-5">
              <h3 className="text-small font-semibold">Need to change something?</h3>
              <p className="text-caption mt-1.5 mb-4 text-muted-foreground">
                This order has not shipped yet, so you can still cancel it.
              </p>
              <CancelOrderDialog orderNumber={order.orderNumber} />
            </div>
          )}

          <ReturnsPanel order={order} />
        </aside>
      </div>
    </div>
  );
}

/**
 * The returns affordance, and — when there is none — the reason.
 *
 * Both branches come from the server's `returnability`. Showing a disabled
 * button with no explanation is the failure mode this avoids: a customer who
 * cannot return something is owed the sentence that says why, whether that is
 * "returns open once it is delivered" or "the window closed on 4 October".
 *
 * A delivered order whose window is still open also gets the closing date,
 * because knowing how long is left is half of what makes the option useful.
 */
function ReturnsPanel({ order }: { order: Order }) {
  const { returnability } = order;

  // Nothing to say at all while an order is still on its way and has never had
  // a return — a panel explaining a future possibility is clutter.
  if (!returnability.returnable && order.status !== 'DELIVERED') return null;

  return (
    /**
     * The `returns` id is a real anchor with a real user: the "Start a return"
     * button in the delivered-order email links straight here, so a customer
     * arrives at the control rather than at the top of the page having to find
     * it. Renaming it means changing `order-delivered.ts` too.
     */
    <div id="returns" className="scroll-mt-24 rounded-2xl border border-border p-5">
      <h3 className="text-small flex items-center gap-2 font-semibold">
        <RotateCcw className="size-4 text-muted-foreground" aria-hidden />
        Returns
      </h3>

      {returnability.returnable ? (
        <>
          <p className="text-caption mt-1.5 mb-4 text-pretty text-muted-foreground">
            Something not right? You can send items back
            {returnability.windowEndsAt
              ? ` until ${formatDate(returnability.windowEndsAt)}`
              : ''}
            .
          </p>
          <ReturnRequestDialog order={order} returnability={returnability} />
        </>
      ) : (
        <p className="text-caption mt-1.5 text-pretty text-muted-foreground">
          {returnability.reason}
        </p>
      )}
    </div>
  );
}

/**
 * The tax invoice, when there is one to show.
 *
 * The server decides: `invoice.available` is true once the order has shipped
 * and carries a tax breakdown. Before it ships the customer is told when to
 * expect one; an order from before invoices existed says nothing, rather than
 * promising a document that will never appear.
 */
function InvoiceLink({ order }: { order: Order }) {
  if (order.invoice.available) {
    return (
      <Link
        href={`/invoice/${encodeURIComponent(order.orderNumber)}`}
        target="_blank"
        rel="noopener"
        className="focus-ring text-small mt-4 flex items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-2.5 font-medium transition-colors hover:border-foreground/25"
      >
        <span className="inline-flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" aria-hidden />
          Tax invoice
        </span>
        {order.invoice.number && (
          <span className="text-caption text-muted-foreground">{order.invoice.number}</span>
        )}
      </Link>
    );
  }

  if (['PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status)) {
    return (
      <p className="text-caption mt-4 text-muted-foreground">
        Your tax invoice will be ready here once the order ships.
      </p>
    );
  }

  return null;
}
