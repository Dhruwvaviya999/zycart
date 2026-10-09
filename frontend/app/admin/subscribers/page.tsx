import type { Metadata } from 'next';
import { Newspaper } from 'lucide-react';
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
import { SubscriberExportButton } from '@/components/admin/subscriber-export-button';
import { SubscriberFilters } from '@/components/admin/subscriber-filters';
import { subscriberStatusTone } from '@/components/admin/status-tones';
import { toErrorMessage } from '@/services/api';
import { getSubscriberCounts, getSubscribers } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';
import { formatDay } from '@/lib/format';
import {
  SUBSCRIBER_STATUS_LABEL,
  type SubscriberQuery,
  type SubscriberRow,
  type SubscriberStatus,
} from '@/types/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Subscribers' };

/** The server's statuses, read off the label map so there is one list to keep in step. */
const STATUSES = Object.keys(SUBSCRIBER_STATUS_LABEL) as SubscriberStatus[];

/** Which storefront form an address came in through. A label, never free text. */
const SOURCE_LABEL: Record<SubscriberRow['source'], string> = {
  homepage: 'Homepage',
  footer: 'Footer',
  account: 'Account',
};

/**
 * The newsletter list.
 *
 * ## What this screen is for
 *
 * Seeing how the list stands — how many confirmed, how many never did — and
 * taking the confirmed part of it to the campaign tool. ZyCart keeps the list
 * and sends nothing to it but the confirmation request; a promotion goes out
 * from the store's marketing tool, fed by the export, so marketing volume never
 * shares a mail account with order confirmations.
 *
 * ## Why the counts and the rows are two requests
 *
 * The same arrangement as the returns queue and the email log: either renders
 * if the other fails.
 *
 * ## Why an operator cannot add or remove anybody
 *
 * An address joins when its owner follows the confirmation link and leaves
 * through the owner's own unsubscribe link. A console that could do either on
 * somebody's behalf would make "Subscribed" mean "an administrator said so",
 * which is not consent — and consent is the only thing the export vouches for.
 */
export default async function AdminSubscribersPage({
  searchParams,
}: PageProps<'/admin/subscribers'>) {
  const params = await searchParams;
  const token = await getSessionToken();

  const single = (key: string): string | undefined => {
    const value = params[key];
    const raw = Array.isArray(value) ? value[0] : value;
    return raw && raw.length > 0 ? raw : undefined;
  };

  const page = Number(single('page') ?? '1');
  const status = single('status');

  const query: SubscriberQuery = {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: 20,
    search: single('search')?.trim() || undefined,
    // Anything that is not one of the server's own values is dropped rather
    // than forwarded, so a hand-edited URL shows the whole list and not a
    // validation error.
    status: STATUSES.includes(status as SubscriberStatus)
      ? (status as SubscriberStatus)
      : undefined,
  };

  const [result, counts] = await Promise.all([
    getSubscribers(query, { token }).catch((error: unknown) => ({ error })),
    // Independent of the list: the rows are still worth reading without them.
    getSubscriberCounts({ token }).catch(() => null),
  ]);

  const header = (
    <AdminPageHeader
      title="Subscribers"
      description="The newsletter list. Only confirmed (double opt-in) addresses are exported, and each row carries its own unsubscribe link for the campaign tool to use."
      action={<SubscriberExportButton />}
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
  const filtered = Boolean(query.search ?? query.status);

  return (
    <>
      {header}

      {counts && (
        <section aria-label="Subscriber summary" className="mb-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Subscribed" value={counts.subscribed.toLocaleString('en-IN')}>
            Confirmed by the owner of the address. These are exactly the rows the export holds.
          </Metric>

          <Metric label="Awaiting confirmation" value={counts.pending.toLocaleString('en-IN')}>
            Entered on the storefront, link not yet followed. Never exported, and sent nothing but
            the request to confirm.
          </Metric>

          <Metric label="Unsubscribed" value={counts.unsubscribed.toLocaleString('en-IN')}>
            Asked to leave. Kept rather than deleted, so no later export can add them back.
          </Metric>
        </section>
      )}

      <SubscriberFilters />

      {items.length === 0 ? (
        <AdminEmpty
          icon={Newspaper}
          title={filtered ? 'No subscribers match these filters' : 'No subscribers yet'}
          body={
            filtered
              ? 'Try a different search, or clear the filters to see the whole list.'
              : 'Addresses appear here as people sign up for the newsletter on the storefront.'
          }
        />
      ) : (
        <>
          {/* A real table on desktop, because operators compare down columns. */}
          <AdminTable
            className="hidden md:block"
            head={
              <>
                <Th>Email</Th>
                <Th>Status</Th>
                <Th className="hidden xl:table-cell">Source</Th>
                <Th>Joined</Th>
                <Th>Confirmed</Th>
              </>
            }
          >
            {items.map((subscriber) => (
              <Tr key={subscriber.id}>
                {/* Allowed to break anywhere, so a long address wraps inside
                    its own column instead of pushing the dates off the edge. */}
                <Td className="font-medium break-all">{subscriber.email}</Td>

                <Td>
                  <StatusBadge tone={subscriberStatusTone(subscriber.status)}>
                    {SUBSCRIBER_STATUS_LABEL[subscriber.status]}
                  </StatusBadge>
                  {/* When they left, on its own line, so the badge stays the
                      one thing the column is scanned for. */}
                  {subscriber.status === 'UNSUBSCRIBED' && subscriber.unsubscribedAt && (
                    <span className="text-caption mt-1 block text-muted-foreground">
                      Left {formatDay(subscriber.unsubscribedAt)}
                    </span>
                  )}
                </Td>

                <Td className="hidden text-muted-foreground xl:table-cell">
                  {SOURCE_LABEL[subscriber.source]}
                </Td>

                <Td className="text-caption whitespace-nowrap text-muted-foreground">
                  {/* `formatDay` rather than `formatDate`: the day in the store's
                      timezone, so somebody who joined just after midnight in
                      India is not dated the day before by a server on UTC. */}
                  {formatDay(subscriber.createdAt)}
                </Td>

                <Td className="text-caption whitespace-nowrap text-muted-foreground">
                  {/* A dash, not the joining date: an address nobody confirmed
                      has no confirmation, and a stand-in would imply consent. */}
                  {subscriber.confirmedAt ? formatDay(subscriber.confirmedAt) : '—'}
                </Td>
              </Tr>
            ))}
          </AdminTable>

          {/* Stacked cards on a phone, rather than a table scrolled sideways. */}
          <ul className="space-y-2 md:hidden">
            {items.map((subscriber) => (
              <li key={subscriber.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-small min-w-0 font-medium break-all">{subscriber.email}</p>
                  <StatusBadge tone={subscriberStatusTone(subscriber.status)}>
                    {SUBSCRIBER_STATUS_LABEL[subscriber.status]}
                  </StatusBadge>
                </div>

                <p className="text-caption mt-1.5 text-pretty text-muted-foreground">
                  {SOURCE_LABEL[subscriber.source]} · Joined {formatDay(subscriber.createdAt)}
                  {subscriber.confirmedAt && ` · Confirmed ${formatDay(subscriber.confirmedAt)}`}
                  {subscriber.status === 'UNSUBSCRIBED' &&
                    subscriber.unsubscribedAt &&
                    ` · Left ${formatDay(subscriber.unsubscribedAt)}`}
                </p>
              </li>
            ))}
          </ul>

          <AdminPagination pagination={pagination} shown={items.length} noun="subscribers" />
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
