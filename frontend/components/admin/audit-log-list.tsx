'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  MessageSquare,
  Package,
  RotateCcw,
  ShoppingCart,
  Truck,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/admin/admin-ui';
import { formatDateTime, formatDayLabel, formatTime } from '@/lib/format';
import {
  AUDIT_ACTION_LABEL,
  type AuditAction,
  type AuditEntity,
  type AuditLogRow,
} from '@/types/admin';

/**
 * The activity log, grouped by day.
 *
 * Each row is a sentence the server wrote at the moment the change happened —
 * "Stock decreased by 7 for Nike Air Max (24 → 17) · Damaged" — rather than a
 * request line. `PATCH /api/admin/products/671f…` is true and useless; this is
 * what somebody actually needs six weeks later.
 *
 * Rows open a detail panel because the log stores the named before/after pairs
 * behind the sentence, and those are worth reading when they matter and worth
 * hiding when they do not.
 */
export function AuditLogList({ entries }: { entries: AuditLogRow[] }) {
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const groups = groupByDay(entries, (entry) => entry.createdAt);

  return (
    <>
      <ol className="space-y-1">
        {groups.map((group) => (
          <li key={group.day}>
            <p className="text-caption mt-5 mb-1.5 font-semibold tracking-wide text-muted-foreground uppercase first:mt-0">
              {group.day}
            </p>

            <ol className="space-y-1">
              {group.entries.map((entry) => {
                const Icon = ENTITY_ICON[entry.entityType];

                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(entry)}
                      className="focus-ring flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="size-4" aria-hidden />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="text-small block text-pretty">{entry.summary}</span>
                        <span className="text-caption mt-0.5 block text-muted-foreground">
                          {formatTime(entry.createdAt)} · {entry.actor.name}
                        </span>
                        {entry.note && (
                          <span className="text-caption mt-0.5 block text-pretty text-muted-foreground italic">
                            “{entry.note}”
                          </span>
                        )}
                      </span>

                      <StatusBadge className="mt-0.5 hidden sm:inline-flex">
                        {AUDIT_ACTION_LABEL[entry.action]}
                      </StatusBadge>
                    </button>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>

      <AuditDetailDialog entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}

const ENTITY_ICON: Record<AuditEntity, LucideIcon> = {
  PRODUCT: Package,
  ORDER: ShoppingCart,
  REVIEW: MessageSquare,
  CUSTOMER: UserCog,
  SHIPMENT: Truck,
  RETURN: RotateCcw,
};

/** Where an entity can still be opened. A deleted product has nowhere to go. */
function entityHref(entry: AuditLogRow): string | null {
  if (!entry.entityId) return null;

  switch (entry.entityType) {
    case 'ORDER':
      return `/admin/orders/${entry.entityLabel || entry.entityId}`;
    case 'PRODUCT':
      return entry.action === 'PRODUCT_DELETED' ? null : `/admin/products/${entry.entityId}`;
    case 'CUSTOMER':
      return `/admin/customers/${entry.entityId}`;
    case 'REVIEW':
      return '/admin/reviews';
    /**
     * A shipment has no page of its own — it is a panel on the order it belongs
     * to, and `entityLabel` is that order's number. Sending an operator to the
     * order is sending them to the shipment.
     */
    case 'SHIPMENT':
      return entry.entityLabel ? `/admin/orders/${entry.entityLabel}` : null;
    case 'RETURN':
      return `/admin/returns/${entry.entityLabel || entry.entityId}`;
  }
}

function AuditDetailDialog({ entry, onClose }: { entry: AuditLogRow | null; onClose: () => void }) {
  const href = entry ? entityHref(entry) : null;

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {entry && (
          <>
            <DialogTitle className="text-h4">{AUDIT_ACTION_LABEL[entry.action]}</DialogTitle>
            <DialogDescription className="text-caption text-pretty text-muted-foreground">
              {entry.summary}
            </DialogDescription>

            <dl className="mt-4 space-y-2.5">
              <Row label="Performed by">
                <span className="block">{entry.actor.name}</span>
                {entry.actor.email && (
                  <span className="text-caption block break-all text-muted-foreground">
                    {entry.actor.email}
                  </span>
                )}
              </Row>

              <Row label="When">{formatDateTime(entry.createdAt)}</Row>

              <Row label="Affected">
                {href ? (
                  <Link
                    href={href}
                    className="focus-ring rounded-sm font-medium text-brand hover:underline"
                  >
                    {entry.entityLabel || entityName(entry.entityType)}
                  </Link>
                ) : (
                  <>
                    <span>{entry.entityLabel || entityName(entry.entityType)}</span>
                    {entry.action === 'PRODUCT_DELETED' && (
                      <span className="text-caption block text-muted-foreground">
                        No longer in the catalogue
                      </span>
                    )}
                  </>
                )}
              </Row>
            </dl>

            {entry.changes.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="text-caption font-medium text-muted-foreground">What changed</p>
                <ul className="mt-2 space-y-1.5">
                  {entry.changes.map((change) => (
                    <li
                      key={change.field}
                      className="text-small flex flex-wrap items-baseline gap-x-2"
                    >
                      <span className="font-medium">{fieldLabel(change.field)}</span>
                      <span className="text-muted-foreground line-through">
                        {change.from || '—'}
                      </span>
                      <span aria-hidden className="text-muted-foreground">
                        →
                      </span>
                      <span className="sr-only">changed to</span>
                      <span className="font-medium">{change.to || '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {entry.note && (
              <p className="text-small mt-4 text-pretty rounded-lg bg-surface/60 p-3">
                {entry.note}
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <Button size="cta" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-caption shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-small min-w-0 text-right">{children}</dd>
    </div>
  );
}

const entityName = (entity: AuditEntity) => entity.charAt(0) + entity.slice(1).toLowerCase();

/**
 * Splits a list into consecutive runs that share a day label.
 *
 * Grouping up front rather than tracking the previous day inside the render
 * loop: a variable mutated across `.map` callbacks depends on the order React
 * happens to call them in, which is exactly the kind of assumption that breaks
 * quietly. This is a pure function of the input, and the markup that follows is
 * a plain nested map.
 *
 * Runs rather than a keyed map, because the list is already sorted and a day
 * should appear once, where it falls.
 */
function groupByDay<T>(entries: T[], at: (entry: T) => string): { day: string; entries: T[] }[] {
  const groups: { day: string; entries: T[] }[] = [];

  for (const entry of entries) {
    const day = formatDayLabel(at(entry));
    const current = groups.at(-1);

    if (current?.day === day) current.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }

  return groups;
}

/** `lowStockThreshold` → `Low stock threshold`. Field names are for the schema. */
function fieldLabel(field: string): string {
  const spaced = field.replace(/([A-Z])/g, ' $1').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type { AuditAction };
