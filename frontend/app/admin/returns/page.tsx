import type { Metadata } from 'next';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
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
import { ReturnFilters } from '@/components/admin/return-filters';
import { returnStatusTone } from '@/components/admin/status-tones';
import { toErrorMessage } from '@/services/api';
import { getReturns, getReturnsSummary } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';
import { formatDate, formatPrice } from '@/lib/format';
import { RETURN_ADMIN_LABEL, RETURN_STATUSES, type ReturnStatus } from '@/types/fulfillment';
import type { AdminReturnQuery } from '@/types/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Returns' };

/**
 * The return queue.
 *
 * ## Two things on one screen, on purpose
 *
 * The counts at the top and the rows underneath come from two independent
 * requests, and either renders if the other fails. An operator whose summary
 * query times out should still be able to work the queue.
 *
 * ## The metric, and why both halves of it are shown
 *
 * The return rate is `requests raised / orders delivered`, over the same
 * window, and the raw counts are printed beside the percentage so it can be
 * checked rather than trusted. Both halves are order-level: one request counts
 * once however many lines it covers. Mixing an item-level numerator with an
 * order-level denominator is the classic way to produce a number that is
 * quietly meaningless, and it is not done here.
 *
 * With nothing delivered in the window the percentage is absent rather than
 * zero — "0%" would read as "nothing gets returned" rather than "nothing has
 * been delivered".
 */
export default async function AdminReturnsPage({ searchParams }: PageProps<'/admin/returns'>) {
  const params = await searchParams;
  const token = await getSessionToken();

  const single = (key: string): string | undefined => {
    const value = params[key];
    const raw = Array.isArray(value) ? value[0] : value;
    return raw && raw.length > 0 ? raw : undefined;
  };

  const page = Number(single('page') ?? '1');

  const query: AdminReturnQuery = {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: 20,
    search: single('search'),
    status: RETURN_STATUSES.includes(single('status') as ReturnStatus)
      ? (single('status') as ReturnStatus)
      : undefined,
    sort: single('sort') === 'oldest' ? 'oldest' : 'newest',
  };

  const [result, summary] = await Promise.all([
    getReturns(query, { token }).catch((error: unknown) => ({ error })),
    // Independent of the list: the queue is still workable without the counts.
    getReturnsSummary({ token }).catch(() => null),
  ]);

  const header = (
    <AdminPageHeader
      title="Returns"
      description="Everything customers have asked to send back, and where each request has got to."
    />
  );

  if ('error' in result) {
    return (
      <>
        {header}
        <AdminError message={toErrorMessage(result.error)} />
      </>
    );
  }

  const { items, pagination } = result;

  return (
    <>
      {header}

      {summary && (
        <section aria-label="Return summary" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Open requests" value={summary.open.toLocaleString('en-IN')}>
            Requested, approved, received or awaiting a refund.
          </Metric>

          <Metric
            label="Awaiting review"
            value={summary.byStatus.REQUESTED.toLocaleString('en-IN')}
          >
            Nobody has approved or rejected these yet.
          </Metric>

          <Metric
            label="Refunds outstanding"
            value={(
              summary.byStatus.RECEIVED + summary.byStatus.REFUND_PENDING
            ).toLocaleString('en-IN')}
          >
            Goods are back, or the money is with the bank.
          </Metric>

          <Metric
            label={`Return rate · ${String(summary.rate.days)} days`}
            value={summary.rate.percent === null ? '—' : `${String(summary.rate.percent)}%`}
          >
            {summary.rate.percent === null
              ? 'No orders were delivered in this window, so there is no rate to compute.'
              : `${summary.rate.returnRequests.toLocaleString('en-IN')} requests against ${summary.rate.deliveredOrders.toLocaleString('en-IN')} delivered orders.`}
          </Metric>
        </section>
      )}

      <ReturnFilters />

      {items.length === 0 ? (
        <AdminEmpty
          icon={RotateCcw}
          title={query.status || query.search ? 'Nothing matches' : 'No return requests'}
          body={
            query.status || query.search
              ? 'No returns match these filters. Clear them to see everything.'
              : 'When a customer asks to send something back, it will appear here.'
          }
        />
      ) : (
        <>
          {/* A real table on desktop, because operators compare down columns. */}
          <AdminTable
            className="hidden md:block"
            head={
              <>
                <Th>Return</Th>
                <Th>Customer</Th>
                <Th>Reason</Th>
                <Th align="center">Items</Th>
                <Th align="right">Refund</Th>
                <Th>Requested</Th>
                <Th>Status</Th>
              </>
            }
          >
            {items.map((request) => (
              <Tr key={request.id}>
                <Td>
                  <Link
                    href={`/admin/returns/${request.returnNumber}`}
                    className="focus-ring rounded-sm font-medium hover:underline"
                  >
                    {request.returnNumber}
                  </Link>
                  <span className="text-caption block text-muted-foreground">
                    <Link
                      href={`/admin/orders/${request.orderNumber}`}
                      className="focus-ring rounded-sm hover:underline"
                    >
                      {request.orderNumber}
                    </Link>
                  </span>
                </Td>

                <Td>
                  <span className="block truncate">{request.customer.name}</span>
                  <span className="text-caption block truncate text-muted-foreground">
                    {request.customer.email}
                  </span>
                </Td>

                <Td className="text-caption text-muted-foreground">
                  {request.reasons.join(', ')}
                </Td>

                <Td align="center" className="tabular-nums">
                  {request.itemCount}
                </Td>

                <Td align="right" className="tabular-nums">
                  {/* A dash rather than ₹0 until a refund has a value: zero
                      would read as a decision that has not been made. */}
                  {request.refundAmount > 0 ? (
                    formatPrice(request.refundAmount)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Td>

                <Td className="text-caption whitespace-nowrap text-muted-foreground">
                  {formatDate(request.requestedAt)}
                </Td>

                <Td>
                  <StatusBadge tone={returnStatusTone(request.status)}>
                    {RETURN_ADMIN_LABEL[request.status]}
                  </StatusBadge>
                </Td>
              </Tr>
            ))}
          </AdminTable>

          {/* Stacked cards on a phone, rather than a table scrolled sideways. */}
          <ul className="space-y-3 md:hidden">
            {items.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/admin/returns/${request.returnNumber}`}
                  className="focus-ring block rounded-xl border border-border p-4 transition-colors hover:border-foreground/25"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-small font-medium break-all">{request.returnNumber}</p>
                      <p className="text-caption text-muted-foreground">
                        {request.orderNumber} · {request.customer.name}
                      </p>
                    </div>
                    <StatusBadge tone={returnStatusTone(request.status)}>
                      {RETURN_ADMIN_LABEL[request.status]}
                    </StatusBadge>
                  </div>

                  <p className="text-caption mt-2 text-pretty text-muted-foreground">
                    {request.itemCount} {request.itemCount === 1 ? 'item' : 'items'} ·{' '}
                    {request.reasons.join(', ')} · {formatDate(request.requestedAt)}
                  </p>

                  {request.refundAmount > 0 && (
                    <p className="text-small mt-2 font-medium tabular-nums">
                      Refund {formatPrice(request.refundAmount)}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <AdminPagination pagination={pagination} shown={items.length} noun="returns" />
        </>
      )}
    </>
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
      {/* The denominator, or the caveat. A number with no definition beside it
          is a number somebody will read the wrong way. */}
      <p className="text-caption mt-1 text-pretty text-muted-foreground">{children}</p>
    </div>
  );
}
