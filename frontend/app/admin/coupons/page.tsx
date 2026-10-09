import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, TicketPercent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AdminEmpty,
  AdminError,
  AdminPageHeader,
  AdminTable,
  StatusBadge,
  Td,
  Th,
  Tr,
} from '@/components/admin/admin-ui';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { CouponFilters } from '@/components/admin/coupon-filters';
import { couponStateTone } from '@/components/admin/status-tones';
import { toErrorMessage } from '@/services/api';
import { getCoupons } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';
import { formatDateTime, formatPrice } from '@/lib/format';
import {
  COUPON_STATES,
  COUPON_STATE_LABEL,
  type AdminCouponQuery,
  type AdminCouponRow,
  type CouponState,
} from '@/types/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Coupons' };

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * Turns URL parameters into an API query.
 *
 * A state the server does not know is dropped rather than forwarded — the
 * endpoint is `.strict()` and would answer a hand-edited URL with a 400, where
 * showing every coupon is the better experience.
 */
function toQuery(params: Params): AdminCouponQuery {
  const page = Number(one(params.page));
  const state = one(params.state);

  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: 20,
    search: one(params.search)?.trim() || undefined,
    state: COUPON_STATES.includes(state as CouponState) ? (state as CouponState) : undefined,
  };
}

/**
 * Every promotional code, and whether it works right now.
 *
 * ## The state column is the server's
 *
 * Whether a code is live depends on five things at once — its switch, both of
 * its dates, its usage limit and the clock — and checkout settles that with
 * `couponState` on the server. The badge here is the same answer from the same
 * function, computed in this request, so the console never calls a code active
 * that checkout would refuse.
 *
 * ## Usage is orders, not attempts
 *
 * `usedCount` counts committed orders that still hold the code. A customer who
 * applied it and never checked out used nothing, and a cancelled order gives
 * its use back — so the number shown is the one the limit is measured against.
 */
export default async function AdminCouponsPage({ searchParams }: PageProps<'/admin/coupons'>) {
  const params = await searchParams;
  const query = toQuery(params);

  const header = (
    <AdminPageHeader
      title="Coupons"
      description="Codes customers can apply at checkout, and whether each one works right now."
      action={
        <Button size="sm" variant="brand" render={<Link href="/admin/coupons/new" />}>
          <Plus className="size-3.5" data-icon="inline-start" aria-hidden />
          New coupon
        </Button>
      }
    />
  );

  let result;
  try {
    result = await getCoupons(query, { token: await getSessionToken() });
  } catch (error) {
    return (
      <>
        {header}
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  const { items, pagination } = result;
  const filtered = Boolean(query.search ?? query.state);

  return (
    <>
      {header}

      <CouponFilters />

      {items.length === 0 ? (
        <AdminEmpty
          icon={TicketPercent}
          title={filtered ? 'No coupons match these filters' : 'No coupons yet'}
          body={
            filtered
              ? 'Try a different search, or clear the filters to see every code.'
              : 'Create a code to offer customers a discount at checkout.'
          }
          action={
            !filtered && (
              <Button size="sm" variant="brand" render={<Link href="/admin/coupons/new" />}>
                <Plus className="size-3.5" data-icon="inline-start" aria-hidden />
                New coupon
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* Desktop: a real table, because operators compare down columns. */}
          <AdminTable
            className="hidden md:block"
            head={
              <>
                <Th>Code</Th>
                <Th>Deal</Th>
                <Th align="right">Used</Th>
                <Th className="hidden xl:table-cell">Dates</Th>
                <Th>State</Th>
              </>
            }
          >
            {items.map((coupon) => (
              <Tr key={coupon.id}>
                <Td>
                  <Link
                    href={`/admin/coupons/${coupon.id}`}
                    className="focus-ring rounded-sm font-medium hover:underline"
                  >
                    {coupon.code}
                  </Link>
                  {coupon.description && (
                    <span className="text-caption block max-w-xs truncate text-muted-foreground">
                      {coupon.description}
                    </span>
                  )}
                </Td>

                <Td>
                  <span className="block">{coupon.deal}</span>
                  <span className="text-caption block text-muted-foreground">
                    {minimum(coupon)}
                  </span>
                </Td>

                <Td align="right" className="whitespace-nowrap">
                  <span className="block tabular-nums">{usage(coupon)}</span>
                  <span className="text-caption block text-muted-foreground">
                    {perCustomer(coupon)}
                  </span>
                </Td>

                <Td className="text-caption hidden whitespace-nowrap text-muted-foreground xl:table-cell">
                  {validity(coupon).map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </Td>

                <Td>
                  <StatusBadge tone={couponStateTone(coupon.state)}>
                    {COUPON_STATE_LABEL[coupon.state]}
                  </StatusBadge>
                </Td>
              </Tr>
            ))}
          </AdminTable>

          {/* Stacked cards on a phone, rather than a table scrolled sideways. */}
          <ul className="space-y-3 md:hidden">
            {items.map((coupon) => (
              <li key={coupon.id}>
                <Link
                  href={`/admin/coupons/${coupon.id}`}
                  className="focus-ring block rounded-xl border border-border p-4 transition-colors hover:border-foreground/25"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-small font-medium break-all">{coupon.code}</p>
                      <p className="text-caption text-muted-foreground">{coupon.deal}</p>
                    </div>
                    <StatusBadge tone={couponStateTone(coupon.state)}>
                      {COUPON_STATE_LABEL[coupon.state]}
                    </StatusBadge>
                  </div>

                  {coupon.description && (
                    <p className="text-caption mt-2 text-pretty text-muted-foreground">
                      {coupon.description}
                    </p>
                  )}

                  <p className="text-caption mt-2 text-pretty text-muted-foreground">
                    {usage(coupon)} used · {perCustomer(coupon)} · {minimum(coupon)}
                  </p>
                  <p className="text-caption mt-0.5 text-pretty text-muted-foreground">
                    {validity(coupon).join(' · ')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <AdminPagination pagination={pagination} shown={items.length} noun="coupons" />
        </>
      )}
    </>
  );
}

/** "12 / 500", or "12 / unlimited" for a code with no overall limit. */
function usage(coupon: AdminCouponRow): string {
  const limit =
    coupon.usageLimit === null ? 'unlimited' : coupon.usageLimit.toLocaleString('en-IN');

  return `${coupon.usedCount.toLocaleString('en-IN')} / ${limit}`;
}

function perCustomer(coupon: AdminCouponRow): string {
  if (coupon.perUserLimit === null) return 'No limit per customer';
  return coupon.perUserLimit === 1
    ? 'Once per customer'
    : `${String(coupon.perUserLimit)} per customer`;
}

/** A basket exactly at the minimum qualifies, so this says "minimum", not "over". */
function minimum(coupon: AdminCouponRow): string {
  return coupon.minOrderValue > 0
    ? `Minimum order ${formatPrice(coupon.minOrderValue)}`
    : 'No minimum order';
}

/**
 * When a code works, in store time.
 *
 * Both ends are optional — no start means it has worked since it was created,
 * no end means it works until it is switched off — so each is said in words
 * rather than left as a blank an operator has to interpret.
 */
function validity(coupon: AdminCouponRow): string[] {
  return [
    coupon.startsAt ? `From ${formatDateTime(coupon.startsAt)}` : 'No start date',
    coupon.expiresAt ? `Until ${formatDateTime(coupon.expiresAt)}` : 'No end date',
  ];
}
