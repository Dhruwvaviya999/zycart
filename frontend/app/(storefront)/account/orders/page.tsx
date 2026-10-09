import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Package } from 'lucide-react';
import { AccountPanel } from '@/components/account/account-panel';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { OrderCard } from '@/components/order/order-card';
import { getOrders } from '@/services/order.service';
import { getSessionToken, getSessionUser } from '@/lib/server-auth';
import { toErrorMessage } from '@/services/api';
import { ORDER_PROGRESSION, type OrderStatus } from '@/types/order';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Orders',
  description: 'Your ZyCart order history.',
};

const FILTERS: { label: string; value?: OrderStatus }[] = [
  { label: 'All' },
  ...ORDER_PROGRESSION.map((status) => ({
    label: status[0] + status.slice(1).toLowerCase(),
    value: status,
  })),
  { label: 'Cancelled', value: 'CANCELLED' as OrderStatus },
];

const PAGE_SIZE = 10;

export default async function OrdersPage({ searchParams }: PageProps<'/account/orders'>) {
  const user = await getSessionUser();
  if (!user) redirect('/login?redirect=/account/orders');

  const params = await searchParams;
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = FILTERS.some((entry) => entry.value === rawStatus)
    ? (rawStatus as OrderStatus)
    : undefined;

  const rawPage = Number(Array.isArray(params.page) ? params.page[0] : params.page);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  let result;
  try {
    result = await getOrders(
      { page, limit: PAGE_SIZE, status },
      { token: await getSessionToken() },
    );
  } catch (error) {
    return (
      <AccountPanel title="Orders" description="Everything you have ordered from ZyCart.">
        <ErrorState
          title="We could not load your orders."
          body={toErrorMessage(error)}
          secondaryAction={{ label: 'Back to account', href: '/account' }}
        />
      </AccountPanel>
    );
  }

  const { items, pagination } = result;

  const href = (next: { status?: OrderStatus; page?: number }) => {
    const search = new URLSearchParams();
    const nextStatus = 'status' in next ? next.status : status;
    const nextPage = next.page ?? page;

    if (nextStatus) search.set('status', nextStatus);
    if (nextPage > 1) search.set('page', String(nextPage));

    const query = search.toString();
    return query ? `/account/orders?${query}` : '/account/orders';
  };

  return (
    <AccountPanel
      title="Orders"
      description={
        pagination.total === 0
          ? 'Everything you order will be tracked here.'
          : `${pagination.total} ${pagination.total === 1 ? 'order' : 'orders'} so far.`
      }
    >
      <nav
        aria-label="Filter orders"
        className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {FILTERS.map((filter) => {
          const active = status === filter.value;

          return (
            <Link
              key={filter.label}
              href={href({ status: filter.value, page: 1 })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'focus-ring text-caption shrink-0 rounded-full border px-3.5 py-1.5 font-medium transition-colors',
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={status ? 'No orders with that status.' : 'No orders yet.'}
          body={
            status
              ? 'Try a different filter to see the rest of your order history.'
              : 'When you place an order it will appear here, with its status and everything you bought.'
          }
          action={{
            label: status ? 'Show all orders' : 'Browse the shop',
            href: status ? '/account/orders' : '/shop',
          }}
          className="mt-6"
        />
      ) : (
        <>
          <ul className="mt-6 space-y-4">
            {items.map((order) => (
              <li key={order.id}>
                <OrderCard order={order} />
              </li>
            ))}
          </ul>

          {pagination.totalPages > 1 && (
            <nav
              aria-label="Order pages"
              className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-6"
            >
              <p className="text-small text-muted-foreground tabular-nums">
                Page {pagination.page} of {pagination.totalPages}
              </p>

              <div className="flex gap-2">
                {pagination.page > 1 && (
                  <Link
                    href={href({ page: pagination.page - 1 })}
                    className="focus-ring text-small rounded-xl border border-border px-4 py-2 font-medium transition-colors hover:bg-muted"
                  >
                    Previous
                  </Link>
                )}
                {pagination.page < pagination.totalPages && (
                  <Link
                    href={href({ page: pagination.page + 1 })}
                    className="focus-ring text-small rounded-xl border border-border px-4 py-2 font-medium transition-colors hover:bg-muted"
                  >
                    Next
                  </Link>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </AccountPanel>
  );
}
