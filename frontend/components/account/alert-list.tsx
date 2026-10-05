'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Bell, Loader2, MailCheck, Trash2, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { toErrorMessage } from '@/services/api';
import { deleteAlert } from '@/services/alert.service';
import { formatDay, formatPrice } from '@/lib/format';
import { ALERT_TYPE_LABEL, type AlertView } from '@/types/alert';
import { cn } from '@/lib/utils';

/**
 * Every alert this customer has set, waiting ones first (Phase 20).
 *
 * An alert is otherwise only visible on the product it is about, which makes
 * "what am I waiting for?" a hunt. Sent alerts stay listed as a record of what
 * was emailed and when; they do nothing more, and watching again means setting
 * a new one from the product page — the same one-shot rule the API applies.
 *
 * Dates go through `formatDay`, which pins the store's timezone, because this
 * list is rendered on the server and again in the browser and the two must
 * print the same day.
 */
export function AlertList({ initialAlerts }: { initialAlerts: AlertView[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [removing, setRemoving] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);

  async function remove(alertId: string) {
    if (removing) return;

    setRemoving(alertId);
    setFailure(null);

    try {
      await deleteAlert(alertId);
      setAlerts((current) => current.filter((alert) => alert.id !== alertId));
    } catch (error) {
      setFailure({ id: alertId, message: toErrorMessage(error) });
    } finally {
      setRemoving(null);
    }
  }

  if (alerts.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="You’re not watching anything yet."
        body="On a product page, choose “Notify me when it’s back” on something sold out, or “Alert me if the price drops” on anything at all. We’ll email you once, the moment it happens."
        action={{ label: 'Continue shopping', href: '/shop' }}
        secondaryAction={{ label: 'View your wishlist', href: '/wishlist' }}
      />
    );
  }

  const waiting = alerts.filter((alert) => alert.status === 'ACTIVE');
  // Most recently sent first: the one a customer comes looking for is the
  // email they have just read.
  const sent = alerts
    .filter((alert) => alert.status === 'NOTIFIED')
    .sort((a, b) => (b.notifiedAt ?? b.createdAt).localeCompare(a.notifiedAt ?? a.createdAt));

  const groups = [
    { key: 'waiting', title: 'Waiting', items: waiting },
    { key: 'sent', title: 'Sent', items: sent },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`alerts-${group.key}`}>
          <h3 id={`alerts-${group.key}`} className="text-label text-muted-foreground">
            {group.title} · {group.items.length}
          </h3>

          <ul className="mt-3 space-y-3">
            {group.items.map((alert) => (
              <li key={alert.id}>
                <AlertCard
                  alert={alert}
                  removing={removing === alert.id}
                  locked={removing !== null}
                  error={failure?.id === alert.id ? failure.message : undefined}
                  onRemove={() => void remove(alert.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AlertCard({
  alert,
  removing,
  locked,
  error,
  onRemove,
}: {
  alert: AlertView;
  removing: boolean;
  /** Any removal in flight locks every button, so two cannot race. */
  locked: boolean;
  error?: string;
  onRemove: () => void;
}) {
  const { product } = alert;
  const sent = alert.status === 'NOTIFIED';
  const TypeIcon = alert.type === 'PRICE_DROP' ? TrendingDown : Bell;

  return (
    <article
      className={cn(
        'rounded-2xl border border-border p-5 transition-colors hover:border-foreground/25',
        sent && 'bg-surface/60',
      )}
    >
      <div className="flex items-start gap-4">
        <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface">
          {product.image && (
            <Image src={product.image} alt="" fill sizes="64px" className="object-cover" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-2 py-0.5 font-medium text-brand">
              <TypeIcon className="size-3" aria-hidden />
              {ALERT_TYPE_LABEL[alert.type]}
            </span>
            {/* Icon plus words, never colour alone. */}
            {sent && (
              <span className="text-caption inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2 py-0.5 font-medium text-success">
                <MailCheck className="size-3" aria-hidden />
                Sent
              </span>
            )}
          </div>

          <h4 className="text-small mt-2 font-semibold break-words">
            {product.exists ? (
              <Link href={`/products/${product.slug}`} className="focus-ring rounded-sm">
                {product.name}
              </Link>
            ) : (
              product.name
            )}
          </h4>

          {alert.variant && (
            <p className="text-caption mt-0.5 text-muted-foreground">{alert.variant}</p>
          )}

          <p className="text-caption mt-2 text-pretty">
            <AlertOutcome alert={alert} />
          </p>

          <p className="text-caption mt-1 text-pretty text-muted-foreground">
            <CurrentState product={product} />
          </p>

          <p className="text-caption mt-2 text-muted-foreground">
            Set <time dateTime={alert.createdAt}>{formatDay(alert.createdAt)}</time>
            {alert.notifiedAt && (
              <>
                {' · '}Emailed{' '}
                <time dateTime={alert.notifiedAt}>{formatDay(alert.notifiedAt)}</time>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button
          size="sm"
          variant="ghost"
          disabled={locked}
          onClick={onRemove}
          aria-label={`Remove ${ALERT_TYPE_LABEL[alert.type].toLowerCase()} alert for ${product.name}`}
        >
          {removing ? (
            <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" aria-hidden />
          ) : (
            <Trash2 className="size-3.5" data-icon="inline-start" aria-hidden />
          )}
          Remove
        </Button>

        {error && (
          <p role="alert" className="text-caption font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

/** What the alert is waiting for, or what it said when it was answered. */
function AlertOutcome({ alert }: { alert: AlertView }) {
  if (alert.type === 'PRICE_DROP') {
    if (alert.status === 'NOTIFIED') {
      return alert.notifiedPrice === null ? (
        <>The price dropped and we emailed you.</>
      ) : (
        <>
          Dropped to <span className="font-semibold">{formatPrice(alert.notifiedPrice)}</span>
          {alert.priceAtCreation !== null && (
            <span className="text-muted-foreground">
              {' '}
              from {formatPrice(alert.priceAtCreation)}
            </span>
          )}
        </>
      );
    }

    return alert.priceAtCreation === null ? (
      <>Watching for a lower price</>
    ) : (
      <>
        Watching below <span className="font-semibold">{formatPrice(alert.priceAtCreation)}</span>
      </>
    );
  }

  return alert.status === 'NOTIFIED' ? (
    <>It came back in stock and we emailed you.</>
  ) : (
    <>Waiting for {alert.variant ? 'this option' : 'it'} to come back in stock</>
  );
}

/**
 * The product as it stands now — which can differ from what the alert says.
 *
 * A sent restock alert can be sold out again by the time it is read, and that
 * is worth knowing before following the link. For a restock alert the API
 * answers about the option it names, so "in stock" here means that option.
 */
function CurrentState({ product }: { product: AlertView['product'] }) {
  if (!product.exists) return <>No longer available</>;

  const parts = [
    product.available === null ? null : product.available ? 'In stock now' : 'Out of stock',
    product.price === null ? null : `${formatPrice(product.price)} today`,
  ].filter(Boolean);

  return <>{parts.join(' · ')}</>;
}
