import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CreditCard, MapPin, User } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { AdminError, AdminPageHeader, StatusBadge } from '@/components/admin/admin-ui';
import { OrderStatusControl } from '@/components/admin/order-status-control';
import { humanise, orderStatusTone, paymentStatusTone } from '@/components/admin/status-tones';
import { ApiError, toErrorMessage } from '@/services/api';
import { getOrder } from '@/services/admin.service';
import { getSessionCookie } from '@/lib/server-auth';
import { formatDate, formatPrice } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Order' };

/**
 * One order, for an operator.
 *
 * Laid out around the distinction Phase 7 established: **payment** and
 * **fulfilment** are separate panels, because they are separate states that
 * move independently. Putting them in one status block would recreate exactly
 * the confusion the data model was designed to avoid.
 *
 * Payment shows gateway reference ids — which support genuinely needs to quote
 * — and nothing else from the gateway. Card numbers, CVVs and UPI PINs never
 * reach ZyCart at all, so there is nothing here to redact.
 */
export default async function AdminOrderPage({ params }: PageProps<'/admin/orders/[orderRef]'>) {
  const { orderRef } = await params;

  let order;
  try {
    order = await getOrder(orderRef, { cookie: await getSessionCookie() });
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();

    return (
      <>
        <AdminPageHeader title="Order" back={{ href: '/admin/orders', label: 'Orders' }} />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  const address = order.shippingAddress;

  return (
    <>
      <AdminPageHeader
        title={order.orderNumber}
        description={`Placed ${formatDate(order.createdAt)} · ${order.itemCount} ${order.itemCount === 1 ? 'item' : 'items'} · ${formatPrice(order.pricing.total)}`}
        back={{ href: '/admin/orders', label: 'Orders' }}
        action={
          <>
            <StatusBadge tone={orderStatusTone(order.status)} className="self-center">
              {humanise(order.status)}
            </StatusBadge>
            <StatusBadge tone={paymentStatusTone(order.payment.status)} className="self-center">
              {humanise(order.payment.status)}
            </StatusBadge>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Panel title="Items">
            <ul className="divide-y divide-border">
              {order.items.map((item) => {
                const variant = [item.selectedColor, item.selectedSize].filter(Boolean).join(' · ');

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
                      {/* The snapshot's own text, always — the catalogue may
                          have moved on, and the order says what was bought. */}
                      <p className="text-small font-medium">
                        {item.productSlug ? (
                          <Link
                            href={`/products/${item.productSlug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="focus-ring rounded-sm hover:underline"
                          >
                            {item.productName}
                          </Link>
                        ) : (
                          item.productName
                        )}
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {variant ? `${variant} · ` : ''}SKU {item.sku}
                      </p>
                      <p className="text-caption mt-1 text-muted-foreground">
                        {formatPrice(item.unitPrice)} × {item.quantity}
                      </p>
                    </div>

                    <p className="text-small shrink-0 font-medium tabular-nums">
                      {formatPrice(item.lineTotal)}
                    </p>
                  </li>
                );
              })}
            </ul>

            <Separator className="my-4" />

            <dl className="space-y-2">
              <Row label="Subtotal">{formatPrice(order.pricing.subtotal)}</Row>
              <Row label="Shipping">
                {order.pricing.shipping === 0 ? (
                  <span className="text-muted-foreground">Not charged</span>
                ) : (
                  formatPrice(order.pricing.shipping)
                )}
              </Row>
              <Row label="Tax">
                {order.pricing.tax === 0 ? (
                  <span className="text-muted-foreground">Not charged</span>
                ) : (
                  formatPrice(order.pricing.tax)
                )}
              </Row>
              {order.pricing.discount > 0 && (
                <Row label="Discount">−{formatPrice(order.pricing.discount)}</Row>
              )}
              <Separator className="my-2" />
              <Row label="Total" strong>
                {formatPrice(order.pricing.total)}
              </Row>
            </dl>
          </Panel>

          {order.cancellationReason && (
            <Panel title="Cancellation">
              <p className="text-small text-pretty">{order.cancellationReason}</p>
              {order.cancelledAt && (
                <p className="text-caption mt-1 text-muted-foreground">
                  Cancelled {formatDate(order.cancelledAt)}
                </p>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <OrderStatusControl
            orderNumber={order.orderNumber}
            status={order.status}
            allowed={order.allowedStatuses}
          />

          <Panel title="Payment" icon={CreditCard}>
            <dl className="space-y-2">
              <Row label="Method">
                {order.payment.method === 'COD' ? 'Cash on delivery' : 'Online (Razorpay)'}
              </Row>
              <Row label="Status">
                <StatusBadge tone={paymentStatusTone(order.payment.status)}>
                  {humanise(order.payment.status)}
                </StatusBadge>
              </Row>
              {order.payment.paidAt && <Row label="Paid">{formatDate(order.payment.paidAt)}</Row>}
            </dl>

            {/* Reference ids only. ZyCart never receives card or UPI details, so
                there is nothing sensitive here to withhold. */}
            {(order.payment.razorpayOrderId ?? order.payment.razorpayPaymentId) && (
              <div className="mt-3 space-y-1 border-t border-border pt-3">
                {order.payment.razorpayPaymentId && (
                  <p className="text-caption break-all text-muted-foreground">
                    Payment {order.payment.razorpayPaymentId}
                  </p>
                )}
                {order.payment.razorpayOrderId && (
                  <p className="text-caption break-all text-muted-foreground">
                    Gateway order {order.payment.razorpayOrderId}
                  </p>
                )}
                {order.payment.refundId && (
                  <p className="text-caption break-all text-muted-foreground">
                    Refund {order.payment.refundId}
                  </p>
                )}
              </div>
            )}

            {order.payment.failureReason && (
              <p className="text-caption mt-3 text-pretty text-destructive">
                {order.payment.failureReason}
              </p>
            )}
          </Panel>

          <Panel title="Customer" icon={User}>
            {order.customer ? (
              <>
                <Link
                  href={`/admin/customers/${order.customer.id}`}
                  className="focus-ring text-small block rounded-sm font-medium hover:underline"
                >
                  {order.customer.name}
                </Link>
                <p className="text-caption mt-0.5 break-all text-muted-foreground">
                  {order.customer.email}
                </p>
                {!order.customer.isActive && (
                  <StatusBadge tone="danger" className="mt-2">
                    Account deactivated
                  </StatusBadge>
                )}
              </>
            ) : (
              <p className="text-caption text-muted-foreground">
                This account no longer exists. The order keeps its own copy of the delivery details.
              </p>
            )}
          </Panel>

          <Panel title="Delivering to" icon={MapPin}>
            <address className="text-caption space-y-0.5 text-muted-foreground not-italic">
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
          </Panel>
        </div>
      </div>
    </>
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

function Row({
  label,
  strong,
  children,
}: {
  label: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="text-small flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? 'font-semibold tabular-nums' : 'font-medium tabular-nums'}>
        {children}
      </dd>
    </div>
  );
}
