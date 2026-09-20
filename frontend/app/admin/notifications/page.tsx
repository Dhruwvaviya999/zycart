import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail } from 'lucide-react';
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
import { NotificationFilters } from '@/components/admin/notification-filters';
import { deliveryTone } from '@/components/admin/status-tones';
import { toErrorMessage } from '@/services/api';
import { getCommunicationSummary, getNotifications } from '@/services/admin.service';
import { getSessionCookie } from '@/lib/server-auth';
import { formatDateTime } from '@/lib/format';
import {
  DELIVERY_STATUSES,
  DELIVERY_STATUS_LABEL,
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_LABEL,
  type DeliveryStatus,
  type NotificationEvent,
  type NotificationQuery,
} from '@/types/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Emails' };

/**
 * Every transactional message ZyCart has owed a customer.
 *
 * ## What this screen is for
 *
 * One question, asked by an operator who has just been told a customer never
 * got their shipping notice: *what happened to that message?* So the columns
 * are the ones that answer it — who, what, when, how many attempts — and the
 * default filter is the last thirty days rather than all time.
 *
 * ## Why the counts and the rows are two requests
 *
 * The same arrangement the returns queue has: either renders if the other
 * fails. An operator whose summary query times out should still be able to work
 * the log.
 *
 * ## Why the provider is named
 *
 * "124 sent today" means something very different on the mock provider than on
 * a real mail server, and an operator reading that number is entitled to know
 * which. On mock it says so in words, in a notice that cannot be mistaken for a
 * row of statistics.
 */
export default async function AdminNotificationsPage({
  searchParams,
}: PageProps<'/admin/notifications'>) {
  const params = await searchParams;
  const cookie = await getSessionCookie();

  const single = (key: string): string | undefined => {
    const value = params[key];
    const raw = Array.isArray(value) ? value[0] : value;
    return raw && raw.length > 0 ? raw : undefined;
  };

  const page = Number(single('page') ?? '1');
  const period = single('period');

  const query: NotificationQuery = {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: 20,
    search: single('search'),
    // Anything that is not one of the server's own values is dropped rather
    // than forwarded, so a hand-edited URL produces the default view and not a
    // validation error.
    status: DELIVERY_STATUSES.includes(single('status') as DeliveryStatus)
      ? (single('status') as DeliveryStatus)
      : undefined,
    event: NOTIFICATION_EVENTS.includes(single('event') as NotificationEvent)
      ? (single('event') as NotificationEvent)
      : undefined,
    period:
      period === 'today' || period === '7d' || period === '30d' || period === 'all'
        ? period
        : '30d',
  };

  const [result, summary] = await Promise.all([
    getNotifications(query, { cookie }).catch((error: unknown) => ({ error })),
    getCommunicationSummary({ cookie }).catch(() => null),
  ]);

  const header = (
    <AdminPageHeader
      title="Emails"
      description="Every transactional message ZyCart has owed a customer, and what happened to it."
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
  const filtered = Boolean(query.search ?? query.status ?? query.event);

  return (
    <>
      {header}

      {summary?.provider === 'mock' && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-border bg-surface/40 p-4"
        >
          <p className="text-small font-semibold">No mail is being delivered</p>
          <p className="text-caption mt-1 text-pretty text-muted-foreground">
            This deployment is running the mock email provider. Messages below are composed and
            recorded exactly as they would be, and nothing is sent. Configure SMTP on the server to
            deliver them.
          </p>
        </div>
      )}

      {summary && (
        <section
          aria-label="Email summary"
          className="mb-4 grid gap-3 sm:grid-cols-3"
        >
          <Metric label="Waiting to send" value={summary.pending.toLocaleString('en-IN')}>
            Recorded and not yet accepted by the provider.
          </Metric>

          <Metric label="Failed" value={summary.failed.toLocaleString('en-IN')}>
            {summary.failed > 0
              ? 'These will not be retried on their own. Open one to see why.'
              : 'Nothing needs attention.'}
          </Metric>

          <Metric label="Accepted today" value={summary.sentToday.toLocaleString('en-IN')}>
            {/* "Accepted", not "delivered": ZyCart knows the provider took the
                message and nothing about what happened afterwards. */}
            Handed to the {summary.provider} provider since midnight.
          </Metric>
        </section>
      )}

      <NotificationFilters />

      {items.length === 0 ? (
        <AdminEmpty
          icon={Mail}
          title={filtered ? 'Nothing matches' : 'No emails yet'}
          body={
            filtered
              ? 'No messages match these filters. Clear them to see everything.'
              : 'When an order ships, a return is approved or a refund completes, the message sent to the customer appears here.'
          }
        />
      ) : (
        <>
          {/* A real table on desktop, because operators compare down columns. */}
          <AdminTable
            className="hidden lg:block"
            head={
              <>
                <Th>Event</Th>
                <Th>Customer</Th>
                <Th>Reference</Th>
                <Th align="center">Attempts</Th>
                <Th>Created</Th>
                <Th>Last attempt</Th>
                <Th>Status</Th>
              </>
            }
          >
            {items.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <Link
                    href={`/admin/notifications/${row.id}`}
                    className="focus-ring rounded-sm font-medium hover:underline"
                  >
                    {NOTIFICATION_EVENT_LABEL[row.event]}
                  </Link>
                </Td>

                <Td>
                  <span className="block truncate">{row.customer.name || '—'}</span>
                  <span className="text-caption block truncate text-muted-foreground">
                    {row.customer.email || 'No address on file'}
                  </span>
                </Td>

                <Td>
                  <span className="block truncate">{row.entityLabel}</span>
                  {row.orderNumber && row.orderNumber !== row.entityLabel && (
                    <span className="text-caption block truncate text-muted-foreground">
                      {row.orderNumber}
                    </span>
                  )}
                </Td>

                <Td align="center" className="tabular-nums">
                  {row.attempts}
                </Td>

                <Td className="text-caption whitespace-nowrap text-muted-foreground">
                  {formatDateTime(row.createdAt)}
                </Td>

                <Td className="text-caption whitespace-nowrap text-muted-foreground">
                  {/* A dash rather than the creation time: a message nobody has
                      tried to send has no last attempt, and substituting one
                      would make the two columns agree misleadingly. */}
                  {row.lastAttemptAt ? formatDateTime(row.lastAttemptAt) : '—'}
                </Td>

                <Td>
                  <StatusBadge tone={deliveryTone(row.status)}>
                    {DELIVERY_STATUS_LABEL[row.status]}
                  </StatusBadge>
                </Td>
              </Tr>
            ))}
          </AdminTable>

          {/* Stacked cards below desktop. Seven columns squeezed onto a phone is
              a table nobody can read; these are the same facts, in order of
              what an operator looks for first. */}
          <ul className="space-y-3 lg:hidden">
            {items.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/admin/notifications/${row.id}`}
                  className="focus-ring block rounded-xl border border-border p-4 transition-colors hover:border-foreground/25"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-small font-medium">
                        {NOTIFICATION_EVENT_LABEL[row.event]}
                      </p>
                      <p className="text-caption break-all text-muted-foreground">
                        {row.entityLabel} · {row.customer.email || 'No address on file'}
                      </p>
                    </div>
                    <StatusBadge tone={deliveryTone(row.status)}>
                      {DELIVERY_STATUS_LABEL[row.status]}
                    </StatusBadge>
                  </div>

                  <p className="text-caption mt-2 text-pretty text-muted-foreground">
                    {formatDateTime(row.createdAt)} ·{' '}
                    {row.attempts === 1 ? '1 attempt' : `${String(row.attempts)} attempts`}
                  </p>

                  {row.failureReason && row.status === 'FAILED' && (
                    <p className="text-caption mt-2 text-pretty text-destructive">
                      {row.failureReason}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <AdminPagination pagination={pagination} shown={items.length} noun="emails" />
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
      <p className="text-caption mt-1 text-pretty text-muted-foreground">{children}</p>
    </div>
  );
}
