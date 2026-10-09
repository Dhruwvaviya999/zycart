import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Star } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AdminError, AdminPageHeader, StatusBadge } from '@/components/admin/admin-ui';
import { CustomerStatusControl } from '@/components/admin/customer-status-control';
import { humanise, orderStatusTone, paymentStatusTone } from '@/components/admin/status-tones';
import { ApiError, toErrorMessage } from '@/services/api';
import { getCustomer } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';
import { formatDate, formatPrice } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Customer' };

/**
 * One customer.
 *
 * Built around the four questions support actually gets asked — who is this,
 * does their account work, what have they bought, what have they said — rather
 * than around the shape of the user document.
 *
 * Addresses are **counted, not listed**. An operator needs to know the customer
 * has somewhere to ship to; reading their home address off this page is not a
 * need, and the order being discussed carries the address it shipped to anyway.
 * There is nothing here about their password, and no control that could change
 * their role.
 */
export default async function AdminCustomerPage({ params }: PageProps<'/admin/customers/[id]'>) {
  const { id } = await params;

  let customer;
  try {
    customer = await getCustomer(id, { token: await getSessionToken() });
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();

    return (
      <>
        <AdminPageHeader title="Customer" back={{ href: '/admin/customers', label: 'Customers' }} />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  const letters = customer.name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <>
      <AdminPageHeader
        title={customer.name}
        description={customer.email}
        back={{ href: '/admin/customers', label: 'Customers' }}
        action={
          <StatusBadge tone={customer.isActive ? 'success' : 'danger'} className="self-center">
            {customer.isActive ? 'Active' : 'Deactivated'}
          </StatusBadge>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <div className="flex items-center gap-4">
              <Avatar className="size-12 shrink-0">
                {customer.avatar && <AvatarImage src={customer.avatar} alt="" />}
                <AvatarFallback>{letters || '?'}</AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <p className="text-small font-semibold">{customer.name}</p>
                <p className="text-caption break-all text-muted-foreground">{customer.email}</p>
                {customer.phone && (
                  <p className="text-caption text-muted-foreground">{customer.phone}</p>
                )}
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Orders" value={String(customer.orderCount)} />
              <Stat label="Spent" value={formatPrice(customer.totalSpent)} />
              <Stat label="Cancelled" value={String(customer.cancelledOrders)} />
              <Stat
                label="Reviews"
                value={
                  customer.reviewCount === 0
                    ? '0'
                    : `${customer.reviewCount} · ${customer.averageRating?.toFixed(1) ?? '—'}★`
                }
              />
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-small font-semibold">Recent orders</h2>
              {customer.orderCount > 0 && (
                <Link
                  href={`/admin/orders?search=${encodeURIComponent(customer.email)}`}
                  className="focus-ring text-caption rounded-md font-medium text-brand hover:underline"
                >
                  All orders
                </Link>
              )}
            </div>

            {customer.recentOrders.length === 0 ? (
              <p className="text-caption text-muted-foreground">
                This customer has not placed an order yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {customer.recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/admin/orders/${order.orderNumber}`}
                      className="focus-ring flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md py-2.5 transition-colors hover:bg-muted/40"
                    >
                      <span className="text-small min-w-0 flex-1">
                        <span className="block truncate font-medium">{order.orderNumber}</span>
                        <span className="text-caption block text-muted-foreground">
                          {formatDate(order.createdAt)}
                        </span>
                      </span>

                      <StatusBadge tone={orderStatusTone(order.status)}>
                        {humanise(order.status)}
                      </StatusBadge>
                      <StatusBadge tone={paymentStatusTone(order.paymentStatus)}>
                        {humanise(order.paymentStatus)}
                      </StatusBadge>

                      <span className="text-small shrink-0 font-medium tabular-nums">
                        {formatPrice(order.total)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <h2 className="text-small font-semibold">Account</h2>

            <dl className="mt-3 space-y-2">
              <Row label="Joined">{formatDate(customer.createdAt)}</Row>
              <Row label="Last signed in">
                {customer.lastLoginAt ? formatDate(customer.lastLoginAt) : 'Never'}
              </Row>
              <Row label="Email verified">{customer.isEmailVerified ? 'Yes' : 'No'}</Row>
              <Row label="Saved addresses">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-muted-foreground" aria-hidden />
                  {customer.addressCount}
                </span>
              </Row>
            </dl>

            <div className="mt-4 border-t border-border pt-4">
              <CustomerStatusControl
                customerId={customer.id}
                name={customer.name}
                isActive={customer.isActive}
              />
              <p className="text-caption mt-2 text-pretty text-muted-foreground">
                Deactivating signs them out immediately and blocks sign-in. Nothing is deleted.
              </p>
            </div>
          </section>

          {customer.reviewCount > 0 && (
            <section className="rounded-xl border border-border bg-surface/40 p-5">
              <h2 className="text-small flex items-center gap-2 font-semibold">
                <Star className="size-4 text-muted-foreground" aria-hidden />
                Reviews
              </h2>
              <p className="text-caption mt-2 text-muted-foreground">
                {customer.reviewCount} approved {customer.reviewCount === 1 ? 'review' : 'reviews'}
                {customer.averageRating !== null &&
                  `, averaging ${customer.averageRating.toFixed(1)} stars`}
                .
              </p>
              <Link
                href={`/admin/reviews?search=${encodeURIComponent(customer.email)}`}
                className="focus-ring text-caption mt-3 inline-block rounded-md font-medium text-brand hover:underline"
              >
                View their reviews
              </Link>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-small mt-0.5 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-small flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
