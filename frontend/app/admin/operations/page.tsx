import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Siren } from 'lucide-react';
import { AdminEmpty, AdminError, AdminPageHeader, StatusBadge } from '@/components/admin/admin-ui';
import { attentionTone, humanise, orderStatusTone } from '@/components/admin/status-tones';
import { toErrorMessage } from '@/services/api';
import { getOperations, getOrders } from '@/services/admin.service';
import { getSessionCookie } from '@/lib/server-auth';
import { formatDateTime, formatPrice } from '@/lib/format';
import type { AdminOrderRow, OperationsSummary } from '@/types/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Needs attention' };

/**
 * What needs a person today.
 *
 * Every row here trips a rule that is decidable from stored data — a payment
 * that failed, a refund that has not settled, an order in progress that never
 * took stock. Nothing is inferred and nothing is scored, because an alert an
 * operator cannot verify by opening the order is an alert they will learn to
 * ignore, and the panel stops working the moment that happens.
 *
 * The rules themselves live on the server in `operations.service`, alongside
 * the filter that pages through them, so the count in this heading and the rows
 * underneath it cannot disagree.
 *
 * When there is nothing to do, this page says so plainly rather than showing an
 * empty table and leaving an operator to wonder whether it loaded.
 */
export default async function AdminOperationsPage() {
  const cookie = await getSessionCookie();

  const [summary, queue] = await Promise.all([
    getOperations({ cookie }).catch((error: unknown) => ({ error })),
    // Independent: the list renders even if the counts fail, and vice versa.
    getOrders({ attention: true, limit: 20, sort: 'oldest' }, { cookie }).catch(() => null),
  ]);

  const header = (
    <AdminPageHeader
      title="Needs attention"
      description="Orders where something has gone wrong, or stopped moving."
    />
  );

  if ('error' in summary) {
    return (
      <>
        {header}
        <AdminError message={toErrorMessage(summary.error)} />
      </>
    );
  }

  const clear = summary.ordersNeedingAttention === 0;

  return (
    <>
      {header}

      {clear ? (
        <section className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-5">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <div>
            <p className="text-small font-semibold">Nothing needs attention</p>
            <p className="text-caption mt-1 text-pretty text-muted-foreground">
              No failed payments, no refunds outstanding, and nothing stuck in fulfilment. Checked{' '}
              {formatDateTime(summary.checkedAt)}.
            </p>
          </div>
        </section>
      ) : (
        <section aria-label="What is wrong" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {summary.breakdown.map((entry) => (
            <div key={entry.key} className="rounded-xl border border-border bg-surface/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-small font-semibold">{entry.label}</p>
                <StatusBadge tone={attentionTone(entry.severity)}>
                  {entry.count.toLocaleString('en-IN')}
                </StatusBadge>
              </div>
              <p className="text-caption mt-1.5 text-pretty text-muted-foreground">
                {entry.action}
              </p>
            </div>
          ))}
        </section>
      )}

      <QueueDepth queue={summary.queue} />

      {!clear && (
        <section className="mt-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-small font-semibold">
              {summary.ordersNeedingAttention.toLocaleString('en-IN')}{' '}
              {summary.ordersNeedingAttention === 1 ? 'order' : 'orders'} to look at
            </h2>
            <Link
              href="/admin/orders?attention=true"
              className="focus-ring text-caption inline-flex items-center gap-1 rounded-md font-medium text-brand hover:underline"
            >
              Open in the orders list
              <ArrowRight className="size-3" aria-hidden />
            </Link>
          </div>

          {queue === null ? (
            <AdminError message="The order list could not be loaded. The counts above are still accurate." />
          ) : queue.items.length === 0 ? (
            <AdminEmpty
              icon={Siren}
              title="These orders have just been dealt with"
              body="The counts above were taken a moment before this list. Refresh to see the current position."
            />
          ) : (
            <ul className="space-y-2">
              {queue.items.map((order) => (
                <AttentionRow key={order.id} order={order} />
              ))}
            </ul>
          )}

          {queue !== null && queue.pagination.total > queue.items.length && (
            <p className="text-caption mt-3 text-muted-foreground">
              Showing the {queue.items.length} oldest of {queue.pagination.total}.{' '}
              <Link
                href="/admin/orders?attention=true"
                className="focus-ring rounded-sm font-medium text-brand hover:underline"
              >
                See them all
              </Link>
              .
            </p>
          )}
        </section>
      )}
    </>
  );
}

/**
 * Oldest first, because an order that has been stuck longest is the one most
 * likely to have a customer waiting on it.
 */
function AttentionRow({ order }: { order: AdminOrderRow }) {
  return (
    <li>
      <Link
        href={`/admin/orders/${order.orderNumber}`}
        className="focus-ring block rounded-xl border border-border p-3 transition-colors hover:bg-muted/40"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-small font-semibold">{order.orderNumber}</span>
          <span className="text-caption text-muted-foreground">
            {formatDateTime(order.createdAt)}
          </span>
        </div>

        <p className="text-caption mt-0.5 truncate text-muted-foreground">
          {order.customer.name} · {formatPrice(order.total)} ·{' '}
          {order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online'}
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusBadge tone={orderStatusTone(order.status)}>{humanise(order.status)}</StatusBadge>

          {order.attention.map((flag) => (
            <StatusBadge key={flag.key} tone={attentionTone(flag.severity)}>
              {flag.label}
            </StatusBadge>
          ))}
        </div>
      </Link>
    </li>
  );
}

/**
 * How much work is sitting in each stage.
 *
 * Not an exception — a queue depth is normal and non-zero in a healthy shop —
 * so it is styled as information rather than as an alarm, and separated from
 * the panel above it.
 */
function QueueDepth({ queue }: { queue: OperationsSummary['queue'] }) {
  const stages = [
    { label: 'Awaiting confirmation', count: queue.pending, status: 'PENDING' },
    { label: 'Confirmed', count: queue.confirmed, status: 'CONFIRMED' },
    { label: 'Processing', count: queue.processing, status: 'PROCESSING' },
    { label: 'Shipped', count: queue.shipped, status: 'SHIPPED' },
  ];

  const total = stages.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <section aria-label="Fulfilment queue" className="mt-4">
      <h2 className="text-small mb-3 font-semibold">Fulfilment queue</h2>

      {total === 0 ? (
        <p className="text-caption rounded-xl border border-dashed border-border bg-surface/40 px-4 py-6 text-center text-muted-foreground">
          No orders in progress. Everything placed has been delivered or cancelled.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stages.map((stage) => (
            <li key={stage.status}>
              <Link
                href={`/admin/orders?status=${stage.status}`}
                className="focus-ring block rounded-xl border border-border bg-surface/40 p-4 transition-colors hover:bg-muted/40"
              >
                <span className="text-caption block font-medium text-muted-foreground">
                  {stage.label}
                </span>
                <span className="text-h3 mt-1.5 block tabular-nums">
                  {stage.count.toLocaleString('en-IN')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
