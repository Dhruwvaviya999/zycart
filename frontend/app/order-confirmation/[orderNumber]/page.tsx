import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Check, MapPin, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Container } from '@/components/layout/container';
import { ApiError } from '@/services/api';
import { getOrderById } from '@/services/order.service';
import { getSessionCookie, getSessionUser } from '@/lib/server-auth';
import { formatDate, formatPrice } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Order placed',
  description: 'Your ZyCart order has been placed.',
};

/**
 * The order is read back from the API rather than carried over from checkout
 * state: the customer is being told their order exists, so it has to be the
 * stored one that says so.
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

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-full bg-success/12 text-success">
            <Check className="size-7" aria-hidden />
          </span>

          <h1 className="text-h1 mt-6">Order placed</h1>
          <p className="text-body mt-3 text-pretty text-muted-foreground">
            Thank you for shopping with ZyCart. We have your order and will let you know as soon as
            it is on the way.
          </p>
        </div>

        <div className="mt-9 rounded-3xl border border-border bg-surface p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-label text-muted-foreground">Order number</p>
              <p className="text-h3 mt-1 font-semibold tracking-tight">{order.orderNumber}</p>
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
              <p className="text-caption mt-2 text-muted-foreground">
                Cash on delivery — pay {formatPrice(order.pricing.total)} when your order arrives.
              </p>
              <p className="text-caption mt-2 text-muted-foreground">
                Nothing has been charged yet.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            size="cta-lg"
            variant="brand"
            render={<Link href={`/account/orders/${order.orderNumber}`} />}
          >
            View order
          </Button>
          <Button size="cta-lg" variant="outline" render={<Link href="/shop" />}>
            Continue shopping
          </Button>
        </div>
      </div>
    </Container>
  );
}
