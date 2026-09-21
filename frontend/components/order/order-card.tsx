import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { OrderStatusBadge } from '@/components/order/order-status-badge';
import { paymentMethodLabel, paymentStatusLabel } from '@/components/payment/payment-status';
import { formatDate, formatPrice } from '@/lib/format';
import type { OrderListItem } from '@/types/order';

/**
 * One order in the history.
 *
 * Built as a card rather than a table row on purpose: a table of orders is the
 * thing that always overflows on a phone, and the same layout works at every
 * width here.
 */
export function OrderCard({ order }: { order: OrderListItem }) {
  return (
    <article className="rounded-2xl border border-border p-5 transition-colors hover:border-foreground/25">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-small font-semibold tracking-tight">
            <Link
              href={`/account/orders/${order.orderNumber}`}
              className="focus-ring rounded-sm break-all"
            >
              {order.orderNumber}
            </Link>
          </h3>
          <p className="text-caption mt-1 text-muted-foreground">
            {formatDate(order.createdAt)} · {order.itemCount}{' '}
            {order.itemCount === 1 ? 'item' : 'items'}
          </p>
        </div>

        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <ul className="flex -space-x-3">
          {order.preview.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <span className="relative block size-11 overflow-hidden rounded-xl bg-surface ring-2 ring-background">
                {item.image && (
                  <Image src={item.image} alt="" fill sizes="44px" className="object-cover" />
                )}
              </span>
            </li>
          ))}
          {order.itemCount > order.preview.length && (
            <li>
              <span className="text-caption grid size-11 place-items-center rounded-xl bg-muted font-medium text-muted-foreground ring-2 ring-background">
                +{order.itemCount - order.preview.length}
              </span>
            </li>
          )}
        </ul>

        <p className="text-price ml-auto tabular-nums">{formatPrice(order.total)}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-4">
        {/* Kept subtle: payment state is a footnote on a card whose headline is
            the order status, and it is words rather than colour alone. */}
        <p className="text-caption text-muted-foreground">
          {paymentMethodLabel(order.paymentMethod)} ·{' '}
          <span
            className={
              order.paymentStatus === 'FAILED' ? 'font-medium text-destructive' : undefined
            }
          >
            {paymentStatusLabel(order.paymentStatus, order.paymentMethod)}
          </span>
        </p>

        <Link
          href={`/account/orders/${order.orderNumber}`}
          className="focus-ring text-small group ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium text-foreground transition-colors hover:text-brand"
        >
          {order.canPayNow ? 'Complete payment' : 'View order'}
          <ArrowRight className="size-4 transition-transform duration-300 ease-(--ease-brand) group-hover:translate-x-0.5" />
        </Link>
      </div>
    </article>
  );
}
