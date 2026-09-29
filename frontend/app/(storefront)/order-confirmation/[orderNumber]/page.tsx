import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Check, Clock, CircleAlert, MapPin, Undo2, Wallet, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PriceBreakdown } from '@/components/order/price-breakdown';
import { Container } from '@/components/layout/container';
import { PayNowButton } from '@/components/payment/pay-now-button';
import { PaymentConfirming } from '@/components/payment/payment-confirming';
import {
  PaymentStatusBadge,
  paymentMethodLabel,
  paymentStatusExplanation,
} from '@/components/payment/payment-status';
import { ApiError } from '@/services/api';
import { getOrderById } from '@/services/order.service';
import { getSessionCookie, getSessionUser } from '@/lib/server-auth';
import { formatDate, formatPrice } from '@/lib/format';
import type { Order } from '@/types/order';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your order',
  description: 'Your ZyCart order.',
};

type Outcome = 'placed' | 'confirming' | 'failed' | 'refunded' | 'cancelled';

/**
 * What actually happened, read from the stored order rather than from anything
 * the browser carried over from checkout.
 *
 * This is the whole point of the page being a server component that re-reads
 * the order: the customer is about to be told whether their money moved, and
 * only the database is entitled to answer that.
 */
function outcomeOf(order: Order): Outcome {
  if (['REFUND_PENDING', 'REFUNDED'].includes(order.payment.status)) return 'refunded';
  if (order.payment.status === 'PAID') return 'placed';

  // Cash on delivery is placed the moment it exists; nothing is owed yet.
  if (order.payment.method === 'COD' && order.status !== 'CANCELLED') return 'placed';

  // Cancelled is not a failed payment, and must not be described as one.
  if (order.status === 'CANCELLED') return 'cancelled';

  if (order.payment.status === 'FAILED') return 'failed';

  // An online order that is still unpaid: either the customer is mid-payment
  // and the callback has not landed, or they never started one.
  return order.payment.razorpayOrderId ? 'confirming' : 'failed';
}

const HEADLINE: Record<Outcome, { title: string; body: string; icon: LucideIcon; tone: string }> = {
  placed: {
    title: 'Order placed',
    body: 'Thank you for shopping with ZyCart. We have your order and will let you know as soon as it is on the way.',
    icon: Check,
    tone: 'bg-success/12 text-success',
  },
  confirming: {
    title: 'We’re confirming your payment',
    body: 'Your order is reserved while we check with your bank. Please don’t place it again — this page updates on its own.',
    icon: Clock,
    tone: 'bg-muted text-muted-foreground',
  },
  failed: {
    title: 'Payment unsuccessful',
    body: 'We couldn’t complete your payment, so this order has not been placed. Your cart is safe and nothing has been charged.',
    icon: CircleAlert,
    tone: 'bg-destructive/10 text-destructive',
  },
  refunded: {
    title: 'We couldn’t complete this order',
    body: 'Your payment went through, but one of the items sold out before we could confirm it. We have started a full refund to your original payment method.',
    icon: Undo2,
    tone: 'bg-muted text-muted-foreground',
  },
  cancelled: {
    title: 'Order cancelled',
    body: 'This order has been cancelled. Nothing has been charged, and anything you had reserved is back in stock.',
    icon: X,
    tone: 'bg-muted text-muted-foreground',
  },
};

/**
 * The order is read back from the API rather than carried over from checkout
 * state: the customer is being told what happened to their money, so it has to
 * be the stored order that says so.
 */
export default async function OrderConfirmationPage({
  params,
}: PageProps<'/order-confirmation/[orderNumber]'>) {
  const { orderNumber } = await params;

  const user = await getSessionUser();
  if (!user) redirect(`/login?redirect=/order-confirmation/${orderNumber}`);

  let order;
  try {
    order = await getOrderById(orderNumber, { cookie: await getSessionCookie() });
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  }

  const address = order.shippingAddress;
  const outcome = outcomeOf(order);
  const headline = HEADLINE[outcome];
  const Icon = headline.icon;

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center text-center">
          <span className={`grid size-14 place-items-center rounded-full ${headline.tone}`}>
            <Icon className="size-7" aria-hidden />
          </span>

          <h1 className="text-h1 mt-6">{headline.title}</h1>
          <p className="text-body mt-3 text-pretty text-muted-foreground">{headline.body}</p>

          {outcome === 'confirming' && <PaymentConfirming orderNumber={order.orderNumber} />}
        </div>

        <div className="mt-9 rounded-3xl border border-border bg-surface p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-label text-muted-foreground">Order number</p>
              <p className="text-h3 mt-1 font-semibold tracking-tight break-all">
                {order.orderNumber}
              </p>
            </div>
            <div className="text-right">
              <p className="text-label text-muted-foreground">Total</p>
              <p className="text-price-lg mt-1">{formatPrice(order.pricing.total)}</p>
            </div>
          </div>

          <p className="text-caption mt-2 text-muted-foreground">
            Placed on {formatDate(order.createdAt)}
          </p>

          <Separator className="my-6" />

          <ul className="space-y-4">
            {order.items.map((item) => {
              const variant = [item.selectedColor, item.selectedSize].filter(Boolean).join(' · ');

              return (
                <li key={item.id} className="flex gap-3.5">
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-background">
                    {item.productImage && (
                      <Image
                        src={item.productImage}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="text-small block font-medium">{item.productName}</span>
                    <span className="text-caption block text-muted-foreground">
                      {variant ? `${variant} · ` : ''}Qty {item.quantity}
                    </span>
                  </span>

                  <span className="text-small shrink-0 font-medium tabular-nums">
                    {formatPrice(item.lineTotal)}
                  </span>
                </li>
              );
            })}
          </ul>

          <Separator className="my-6" />

          {/* The figures the order was actually priced at — coupon, delivery
              and the GST inside them — so the total above is explained. */}
          <PriceBreakdown pricing={order.pricing} couponCode={order.coupon?.code} />

          <Separator className="my-6" />

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-small flex items-center gap-2 font-semibold">
                <MapPin className="size-4 text-muted-foreground" aria-hidden />
                Delivering to
              </p>
              <address className="text-caption mt-2 space-y-0.5 text-muted-foreground not-italic">
                <p className="text-foreground">{address.fullName}</p>
                <p>{address.addressLine1}</p>
                {address.addressLine2 && <p>{address.addressLine2}</p>}
                <p>
                  {address.city}, {address.state} {address.postalCode}
                </p>
                <p>{address.country}</p>
                <p className="pt-1">{address.phone}</p>
              </address>
            </div>

            <div>
              <p className="text-small flex items-center gap-2 font-semibold">
                <Wallet className="size-4 text-muted-foreground" aria-hidden />
                Payment
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-caption text-muted-foreground">
                  {paymentMethodLabel(order.payment.method)}
                </span>
                <PaymentStatusBadge status={order.payment.status} method={order.payment.method} />
              </div>

              <p className="text-caption mt-2 text-pretty text-muted-foreground">
                {paymentStatusExplanation(order.payment.status, order.payment.method)}
              </p>

              {order.payment.razorpayPaymentId && (
                <p className="text-caption mt-2 break-all text-muted-foreground">
                  Reference {order.payment.razorpayPaymentId}
                </p>
              )}
            </div>
          </div>

          {/* The order exists and is waiting for money. Offered here so a
              customer who closed the window does not have to hunt for it. */}
          {order.canPayNow && (
            <>
              <Separator className="my-6" />
              <PayNowButton orderId={order.id} total={order.pricing.total} />
            </>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            size="cta-lg"
            variant={outcome === 'placed' ? 'brand' : 'outline'}
            render={<Link href={`/account/orders/${order.orderNumber}`} />}
          >
            View order
          </Button>
          <Button
            size="cta-lg"
            variant={outcome === 'placed' ? 'outline' : 'brand'}
            render={<Link href={outcome === 'failed' ? '/cart' : '/shop'} />}
          >
            {outcome === 'failed' ? 'Back to cart' : 'Continue shopping'}
          </Button>
        </div>
      </div>
    </Container>
  );
}
