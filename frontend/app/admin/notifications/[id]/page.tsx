import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, Mail, Server, User } from 'lucide-react';
import { AdminError, AdminPageHeader, StatusBadge } from '@/components/admin/admin-ui';
import { NotificationRetry } from '@/components/admin/notification-retry';
import { deliveryTone } from '@/components/admin/status-tones';
import { ApiError, toErrorMessage } from '@/services/api';
import { getNotification } from '@/services/admin.service';
import { getSessionCookie } from '@/lib/server-auth';
import { formatDateTime } from '@/lib/format';
import {
  DELIVERY_STATUS_LABEL,
  NOTIFICATION_EVENT_LABEL,
  type NotificationDetail,
} from '@/types/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Email' };

/**
 * One message, for an operator.
 *
 * ## What is here
 *
 * The event in words, who it was addressed to, which order or return it is
 * about, what was attempted and when, and — when something went wrong — one
 * sentence saying what. Enough to answer "did this customer get told?" and to
 * do something about it if they did not.
 *
 * ## What is deliberately not here
 *
 * The SMTP host, the SMTP username, the password, any authentication header and
 * the raw provider error. The transport's *name* is shown because it changes
 * how "Sent" should be read; nothing else about it is any of the console's
 * business, and a page that rendered a provider's raw error would be one bad
 * error object away from printing a credential into a browser.
 *
 * The rendered HTML is not stored and so is not shown either. The subject and
 * the template are, which is what identifies the message; reproducing the body
 * from the stored snapshot is what a retry does.
 */
export default async function AdminNotificationPage({
  params,
}: PageProps<'/admin/notifications/[id]'>) {
  const { id } = await params;

  let delivery: NotificationDetail;
  try {
    delivery = await getNotification(id, { cookie: await getSessionCookie() });
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();

    return (
      <>
        <AdminPageHeader title="Email" back={{ href: '/admin/notifications', label: 'Emails' }} />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  /**
   * Where the thing this message was about can be opened.
   *
   * Orders and returns have pages of their own. From Phase 18 a message can
   * also be about an account, a cart or a newsletter address, whose label is
   * the address itself — so those open the list they belong to, filtered to it.
   */
  const label = encodeURIComponent(delivery.entityLabel);
  const entityHref = {
    ORDER: `/admin/orders/${label}`,
    RETURN: `/admin/returns/${label}`,
    USER: `/admin/customers?search=${label}`,
    CART: `/admin/customers?search=${label}`,
    SUBSCRIBER: `/admin/subscribers?search=${label}`,
  }[delivery.entityType];

  return (
    <>
      <AdminPageHeader
        title={NOTIFICATION_EVENT_LABEL[delivery.event]}
        description={`${delivery.entityLabel} · ${delivery.customer.email || 'no address on file'}`}
        back={{ href: '/admin/notifications', label: 'Emails' }}
        action={
          <StatusBadge
            tone={delivery.staleSending ? 'danger' : deliveryTone(delivery.status)}
            className="self-center"
          >
            {delivery.staleSending ? 'Abandoned' : DELIVERY_STATUS_LABEL[delivery.status]}
          </StatusBadge>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          {/*
            Whatever is wrong comes first, because it is the reason somebody
            opened this page. An abandoned send said plainly: the point is not
            that it is old, it is that nobody knows whether the message went
            out and that nothing automatic will decide for the operator.
          */}
          {delivery.staleSending && (
            <section
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"
            >
              <h2 className="text-small flex items-center gap-2 font-semibold text-destructive">
                <AlertTriangle className="size-4" aria-hidden />
                Delivery was abandoned mid-send
              </h2>
              <p className="text-small mt-2 text-pretty">
                A process handed this message to the provider and stopped before hearing back, so
                whether it was accepted is unknown.
              </p>
              <dl className="mt-3 space-y-1">
                <Row label="Last attempt">
                  {delivery.lastAttemptAt ? formatDateTime(delivery.lastAttemptAt) : '—'}
                </Row>
                <Row label="Recovery">
                  <span className="font-normal">Retry here, or run the drain with --include-stale</span>
                </Row>
              </dl>
              <p className="text-caption mt-3 text-pretty text-muted-foreground">
                Either way it may send a second copy. The scheduled drain leaves this alone on
                purpose, because that is a decision for a person.
              </p>
            </section>
          )}

          {/*
            Not a stack trace and not the provider's own error object — one
            sentence ZyCart wrote, plus the facts needed to judge it.
          */}
          {delivery.status === 'FAILED' && delivery.failureReason && (
            <section
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"
            >
              <h2 className="text-small flex items-center gap-2 font-semibold text-destructive">
                <AlertTriangle className="size-4" aria-hidden />
                Delivery failed
              </h2>
              <p className="text-small mt-2 text-pretty">{delivery.failureReason}</p>
              <p className="text-caption mt-2 text-muted-foreground">
                {delivery.attempts === 1 ? '1 attempt' : `${String(delivery.attempts)} attempts`}
                {delivery.lastAttemptAt && ` · last at ${formatDateTime(delivery.lastAttemptAt)}`}
              </p>
            </section>
          )}

          <Panel title="Message" icon={Mail}>
            <dl className="space-y-2">
              <Row label="Event">{NOTIFICATION_EVENT_LABEL[delivery.event]}</Row>
              <Row label="Subject">
                <span className="text-right font-normal">{delivery.subject}</span>
              </Row>
              <Row label="Template">
                {delivery.template} · v{delivery.templateVersion}
              </Row>
              <Row label="Reference">
                <Link href={entityHref} className="focus-ring rounded-sm hover:underline">
                  {delivery.entityLabel}
                </Link>
              </Row>
              {delivery.orderNumber && delivery.orderNumber !== delivery.entityLabel && (
                <Row label="Order">
                  <Link
                    href={`/admin/orders/${encodeURIComponent(delivery.orderNumber)}`}
                    className="focus-ring rounded-sm hover:underline"
                  >
                    {delivery.orderNumber}
                  </Link>
                </Row>
              )}
            </dl>
          </Panel>

          <Panel title="Recipient" icon={User}>
            <dl className="space-y-2">
              <Row label="Name">{delivery.customer.name || '—'}</Row>
              <Row label="Address">
                <span className="break-all">
                  {delivery.customer.email || 'No address on file'}
                </span>
              </Row>
            </dl>
            <p className="text-caption mt-3 text-pretty text-muted-foreground">
              Resolved from the customer&rsquo;s account when the message was created, and frozen
              since. Changing the account&rsquo;s email does not change where this one was sent.
            </p>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Delivery" icon={Server}>
            <dl className="space-y-2">
              <Row label="Status">
                <StatusBadge tone={delivery.staleSending ? 'danger' : deliveryTone(delivery.status)}>
                  {/* The underlying status is still SENDING; the word beside it
                      is what makes the distinction, never the colour alone. */}
                  {DELIVERY_STATUS_LABEL[delivery.status]}
                  {delivery.staleSending ? ' · abandoned' : ''}
                </StatusBadge>
              </Row>
              <Row label="Attempts">{delivery.attempts}</Row>
              <Row label="Created">{formatDateTime(delivery.createdAt)}</Row>
              <Row label="Last attempt">
                {/* A dash, not the creation time: a message nobody has tried to
                    send has no last attempt. */}
                {delivery.lastAttemptAt ? formatDateTime(delivery.lastAttemptAt) : '—'}
              </Row>
              <Row label="Accepted">
                {delivery.sentAt ? formatDateTime(delivery.sentAt) : '—'}
              </Row>
              {delivery.provider && <Row label="Provider">{delivery.provider}</Row>}
              {delivery.providerMessageId && (
                <Row label="Provider id">
                  <span className="text-caption font-mono break-all">
                    {delivery.providerMessageId}
                  </span>
                </Row>
              )}
            </dl>

            {delivery.status === 'SENT' && (
              <p className="text-caption mt-3 text-pretty text-muted-foreground">
                The provider accepted this message. That is not confirmation it reached the
                customer&rsquo;s inbox — ZyCart has no delivery receipts.
              </p>
            )}
          </Panel>

          <Panel title="Retry">
            <NotificationRetry delivery={delivery} />
          </Panel>
        </aside>
      </div>
    </>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface/40 p-5">
      <h2 className="text-small flex items-center gap-2 font-semibold">
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-small flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium tabular-nums">{children}</dd>
    </div>
  );
}
