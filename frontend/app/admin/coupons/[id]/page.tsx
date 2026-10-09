import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AdminError,
  AdminPageHeader,
  AdminTable,
  StatusBadge,
  Td,
  Th,
  Tr,
} from '@/components/admin/admin-ui';
import { CouponForm } from '@/components/admin/coupon-form';
import { ApiError, toErrorMessage } from '@/services/api';
import { getCoupon } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';
import { formatDateTime, formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { COUPON_STATE_LABEL, type AdminCouponDetail } from '@/types/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Coupon' };

/**
 * One coupon: how it is doing, what it offers, and which orders used it.
 *
 * ## The numbers come first
 *
 * A coupon is opened far more often to ask "is this working, and what has it
 * cost?" than to change it, so the uses, the discount given and the state lead
 * and the form sits beneath them. All three are the server's: the state is the
 * same `couponState` checkout asks, and the discount counts only the uses that
 * still stand.
 *
 * ## Why deleting is usually not offered
 *
 * An order that used a coupon carries it in its history, so the server refuses
 * to delete a used one and the form offers the switch instead. Which of the two
 * appears is decided by `canDelete`, the server's answer, rather than guessed
 * from `usedCount` here — a cancelled order gives its use back, and a coupon
 * whose count has returned to zero has still been used.
 */
export default async function AdminCouponPage({ params }: PageProps<'/admin/coupons/[id]'>) {
  const { id } = await params;

  let coupon: AdminCouponDetail;
  try {
    coupon = await getCoupon(id, { token: await getSessionToken() });
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();

    return (
      <>
        <AdminPageHeader title="Coupon" back={{ href: '/admin/coupons', label: 'Coupons' }} />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title={coupon.code}
        description={coupon.description ? `${coupon.deal} · ${coupon.description}` : coupon.deal}
        back={{ href: '/admin/coupons', label: 'Coupons' }}
      />

      <section aria-label="Coupon summary" className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Uses" value={uses(coupon)}>
          {usesNote(coupon)}
        </Metric>

        <Metric label="Discount given" value={formatPrice(coupon.totalDiscount)}>
          Taken off orders that still hold the code. A cancelled order&rsquo;s discount is not
          counted.
        </Metric>

        <Metric label="State" value={COUPON_STATE_LABEL[coupon.state]}>
          {stateNote(coupon)}
        </Metric>
      </section>

      <CouponForm coupon={coupon} />

      <RecentUses redemptions={coupon.redemptions} />
    </>
  );
}

/** "12 / 500", or just "12" when there is no overall limit to measure it against. */
function uses(coupon: AdminCouponDetail): string {
  const used = coupon.usedCount.toLocaleString('en-IN');

  return coupon.usageLimit === null
    ? used
    : `${used} / ${coupon.usageLimit.toLocaleString('en-IN')}`;
}

/**
 * What the count is measured against.
 *
 * A code can finish past its limit. An online order redeems when it is paid,
 * and a customer who has already paid the discounted price is not refunded
 * because somebody else took the last use a moment earlier. The server records
 * the overrun rather than hiding it, and so does this.
 */
function usesNote(coupon: AdminCouponDetail): string {
  const perCustomer =
    coupon.perUserLimit === null
      ? 'No limit per customer.'
      : coupon.perUserLimit === 1
        ? 'Once per customer.'
        : `Up to ${String(coupon.perUserLimit)} per customer.`;

  if (coupon.usageLimit === null) return `No overall limit. ${perCustomer}`;

  const left = coupon.usageLimit - coupon.usedCount;

  if (left < 0) {
    return `${(-left).toLocaleString('en-IN')} over the limit, from payments already under way when the last use went. ${perCustomer}`;
  }

  return `${left.toLocaleString('en-IN')} left. ${perCustomer}`;
}

/** Why the state is what it is, with the time that decides it where there is one. */
function stateNote(coupon: AdminCouponDetail): string {
  switch (coupon.state) {
    case 'ACTIVE':
      return coupon.expiresAt
        ? `Working at checkout until ${formatDateTime(coupon.expiresAt)}.`
        : 'Working at checkout, with no end date.';
    case 'SCHEDULED':
      return coupon.startsAt
        ? `Starts working at ${formatDateTime(coupon.startsAt)}.`
        : 'Not started yet.';
    case 'EXPIRED':
      return coupon.expiresAt
        ? `Stopped working at ${formatDateTime(coupon.expiresAt)}.`
        : 'Past its end date.';
    case 'EXHAUSTED':
      return 'Every permitted use has been taken. Raise the total uses below to reopen it.';
    case 'INACTIVE':
      return 'Switched off, so checkout refuses it whatever its dates say.';
  }
}

/**
 * The latest orders to use this code, newest first.
 *
 * A use that was given back stays in the list, marked, rather than vanishing:
 * the order did apply the code, and an operator asking "why did the count go
 * down?" needs to see which cancellation returned it. Its discount is struck
 * through because it is no longer part of the total above — and the badge says
 * so in words, since a line through a number is not something a screen reader
 * announces.
 */
function RecentUses({ redemptions }: { redemptions: AdminCouponDetail['redemptions'] }) {
  return (
    <section aria-labelledby="coupon-uses" className="mt-8">
      <h2 id="coupon-uses" className="text-small font-semibold">
        Recent uses
      </h2>
      <p className="text-caption mt-0.5 mb-3 text-muted-foreground">
        The latest orders to apply this code, newest first.
      </p>

      {redemptions.length === 0 ? (
        <p className="text-caption rounded-xl border border-dashed border-border bg-surface/40 p-5 text-pretty text-muted-foreground">
          No order has used this code yet.
        </p>
      ) : (
        <>
          <AdminTable
            className="hidden sm:block"
            head={
              <>
                <Th>Order</Th>
                <Th align="right">Discount</Th>
                <Th>Used</Th>
              </>
            }
          >
            {redemptions.map((use) => (
              <Tr key={`${use.orderNumber}:${use.createdAt}`}>
                <Td>
                  <span className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/orders/${encodeURIComponent(use.orderNumber)}`}
                      className="focus-ring rounded-sm font-medium hover:underline"
                    >
                      {use.orderNumber}
                    </Link>
                    {use.released && <StatusBadge>Given back</StatusBadge>}
                  </span>
                </Td>

                <Td
                  align="right"
                  className={cn(
                    'tabular-nums',
                    use.released && 'text-muted-foreground line-through',
                  )}
                >
                  {formatPrice(use.discount)}
                </Td>

                <Td className="text-caption whitespace-nowrap text-muted-foreground">
                  {formatDateTime(use.createdAt)}
                </Td>
              </Tr>
            ))}
          </AdminTable>

          <ul className="space-y-2 sm:hidden">
            {redemptions.map((use) => (
              <li key={`${use.orderNumber}:${use.createdAt}`}>
                <Link
                  href={`/admin/orders/${encodeURIComponent(use.orderNumber)}`}
                  className="focus-ring flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition-colors hover:border-foreground/25"
                >
                  <span className="min-w-0">
                    <span className="text-small block truncate font-medium">{use.orderNumber}</span>
                    <span className="text-caption block text-muted-foreground">
                      {formatDateTime(use.createdAt)}
                    </span>
                  </span>

                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        'text-small font-medium tabular-nums',
                        use.released && 'text-muted-foreground line-through',
                      )}
                    >
                      {formatPrice(use.discount)}
                    </span>
                    {use.released && <StatusBadge>Given back</StatusBadge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-4">
      <p className="text-caption font-medium text-muted-foreground">{label}</p>
      <p className="text-h3 mt-1 tabular-nums">{value}</p>
      <p className="text-caption mt-1 text-pretty text-muted-foreground">{children}</p>
    </div>
  );
}
