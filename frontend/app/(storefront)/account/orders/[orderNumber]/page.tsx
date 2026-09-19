import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, MapPin, Wallet } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { CancelOrderDialog } from '@/components/order/cancel-order-dialog';
import { PayNowButton } from '@/components/payment/pay-now-button';
import { OrderItemReview } from '@/components/reviews/order-item-review';
import {
  PaymentStatusBadge,
  paymentMethodLabel,
  paymentStatusExplanation,
} from '@/components/payment/payment-status';
import { OrderStatusBadge } from '@/components/order/order-status-badge';
import { OrderTimeline } from '@/components/order/order-timeline';
import { ApiError } from '@/services/api';
import { getOrderById } from '@/services/order.service';
import { getSessionCookie, getSessionUser } from '@/lib/server-auth';
import { formatDate, formatPrice } from '@/lib/format';

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

export default async function OrderDetailPage({
  params,
}: PageProps<'/account/orders/[orderNumber]'>) {
  const { orderNumber } = await params;

  const user = await getSessionUser();
  if (!user) redirect(`/login?redirect=/account/orders/${orderNumber}`);

  let order;
  try {
    order = await getOrderById(orderNumber, { cookie: await getSessionCookie() });
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
            {order.itemCount === 1 ? 'item' : 'items'}
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
              <OrderTimeline
                status={order.status}
                cancelledAt={order.cancelledAt}
                cancellationReason={order.cancellationReason}
              />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="text-h4">Summary</h3>

            <dl className="mt-4 space-y-2.5">
              <Row label="Subtotal">{formatPrice(order.pricing.subtotal)}</Row>
              <Row label="Shipping">
                {order.pricing.shipping === 0 ? (
                  <span className="text-muted-foreground">Not charged</span>
                ) : (
                  formatPrice(order.pricing.shipping)
                )}
              </Row>
              <Row label="Taxes">
                {order.pricing.tax === 0 ? (
                  <span className="text-muted-foreground">Not charged</span>
                ) : (
                  formatPrice(order.pricing.tax)
                )}
              </Row>
              {order.pricing.discount > 0 && (
                <Row label="Discount">−{formatPrice(order.pricing.discount)}</Row>
              )}
            </dl>

            <Separator className="my-4" />

            <div className="flex items-baseline justify-between">
              <span className="text-small font-semibold">Total</span>
              <span className="text-price">{formatPrice(order.pricing.total)}</span>
            </div>
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
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-small flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
