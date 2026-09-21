import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { AccountPanel } from '@/components/account/account-panel';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { ReturnStatusBadge } from '@/components/order/return-status-badge';
import { getReturns } from '@/services/return.service';
import { getSessionCookie, getSessionUser } from '@/lib/server-auth';
import { toErrorMessage } from '@/services/api';
import { formatDate, formatPrice } from '@/lib/format';
import { RETURN_STATUSES, RETURN_STATUS_COPY, type ReturnStatus } from '@/types/fulfillment';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Returns',
  description: 'Your ZyCart return requests.',
};

const PAGE_SIZE = 10;

/**
 * Every return this customer has raised.
 *
 * Built as cards rather than a table, for the same reason the order history is:
 * a table of returns is the thing that overflows on a phone, and the card
 * layout works at every width without a second design.
 *
 * The filter and the page both live in the URL, so a filtered view survives a
 * refresh, the back button and a link sent to support.
 */
export default async function ReturnsPage({ searchParams }: PageProps<'/account/returns'>) {
  const user = await getSessionUser();
  if (!user) redirect('/login?redirect=/account/returns');

  const params = await searchParams;

  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = RETURN_STATUSES.includes(rawStatus as ReturnStatus)
    ? (rawStatus as ReturnStatus)
    : undefined;

  const rawPage = Number(Array.isArray(params.page) ? params.page[0] : params.page);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  let result;
  try {
    result = await getReturns(
      { page, limit: PAGE_SIZE, status },
      { cookie: await getSessionCookie() },
    );
  } catch (error) {
    return (
      <AccountPanel title="Returns" description="Everything you have asked to send back.">
        <ErrorState
          title="We could not load your returns."
          body={toErrorMessage(error)}
          secondaryAction={{ label: 'Back to account', href: '/account' }}
        />
      </AccountPanel>
    );
  }

  const { items, pagination } = result;

  const href = (next: { status?: ReturnStatus; page?: number }) => {
    const search = new URLSearchParams();
    const nextStatus = 'status' in next ? next.status : status;
    const nextPage = next.page ?? page;

    if (nextStatus) search.set('status', nextStatus);
    if (nextPage > 1) search.set('page', String(nextPage));

    const query = search.toString();
    return query ? `/account/returns?${query}` : '/account/returns';
  };

  return (
    <AccountPanel
      title="Returns"
      description={
        pagination.total === 0
          ? 'Anything you ask to send back will be tracked here.'
          : `${pagination.total} ${pagination.total === 1 ? 'request' : 'requests'} so far.`
      }
    >
      <nav
        aria-label="Filter returns"
        className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {[undefined, ...RETURN_STATUSES].map((value) => {
          const active = status === value;

          return (
            <Link
              key={value ?? 'all'}
              href={href({ status: value, page: 1 })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'focus-ring text-caption shrink-0 rounded-full border px-3.5 py-1.5 font-medium transition-colors',
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground',
              )}
            >
              {value ? RETURN_STATUS_COPY[value].label : 'All'}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={RotateCcw}
          title={status ? 'Nothing here' : 'No return requests'}
          body={
            status
              ? 'No returns of yours are in that state right now.'
              : 'When something is not right, you can start a return from the order it came on.'
          }
          action={{ label: 'View your orders', href: '/account/orders' }}
        />
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {items.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/account/returns/${request.returnNumber}`}
                  className="focus-ring block rounded-2xl border border-border p-5 transition-colors hover:border-foreground/25"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-small font-semibold tracking-tight break-all">
                        {request.returnNumber}
                      </h3>
                      <p className="text-caption mt-1 text-muted-foreground">
                        Order {request.orderNumber} · requested {formatDate(request.requestedAt)}
                      </p>
                    </div>

                    <ReturnStatusBadge status={request.status} />
                  </div>

                  <p className="text-caption mt-3 text-pretty text-muted-foreground">
                    {request.itemCount} {request.itemCount === 1 ? 'item' : 'items'}
                    {request.preview.length > 0 && ` · ${request.preview.join(', ')}`}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    {/* Only shown once a refund actually has a value — a "₹0"
                        beside a request under review would read as a decision
                        that has not been made. */}
                    <p className="text-caption text-muted-foreground">
                      {request.refundAmount > 0
                        ? `Refund ${formatPrice(request.refundAmount)}`
                        : RETURN_STATUS_COPY[request.status].label}
                    </p>
                    <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {pagination.totalPages > 1 && (
            <nav
              aria-label="Return pages"
              className="mt-6 flex items-center justify-between gap-3"
            >
              {page > 1 ? (
                <Link
                  href={href({ page: page - 1 })}
                  className="focus-ring text-small rounded-xl border border-border px-4 py-2 font-medium transition-colors hover:border-foreground/25"
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}

              <span className="text-caption tabular-nums text-muted-foreground">
                Page {page} of {pagination.totalPages}
              </span>

              {page < pagination.totalPages ? (
                <Link
                  href={href({ page: page + 1 })}
                  className="focus-ring text-small rounded-xl border border-border px-4 py-2 font-medium transition-colors hover:border-foreground/25"
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </AccountPanel>
  );
}
