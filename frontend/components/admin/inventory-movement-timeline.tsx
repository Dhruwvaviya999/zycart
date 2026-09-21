'use client';

import Link from 'next/link';
import { useState } from 'react';
import { History, Loader2, PackageMinus, PackagePlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AdminEmpty, StatusBadge } from '@/components/admin/admin-ui';
import { movementTone, signed } from '@/components/admin/status-tones';
import { getProductMovements } from '@/services/admin.service';
import { toErrorMessage } from '@/services/api';
import { formatDateTime, formatDayLabel, formatTime } from '@/lib/format';
import { MOVEMENT_LABEL, REASON_LABEL, type MovementRow } from '@/types/admin';
import { cn } from '@/lib/utils';

/**
 * A product's stock history, grouped by day.
 *
 * Read top to bottom it answers one question per row — what changed, by how
 * much, and why — and the day headings mean an operator scanning for "what
 * happened this morning" does not have to read timestamps to find it.
 *
 * Every row opens a detail panel, because the ledger stores more than a row can
 * show without becoming unreadable: the quantities either side of the change,
 * the order behind it, the note somebody left. That is the level at which the
 * arithmetic is checkable, which is the point of storing both quantities.
 *
 * Older movements are fetched a page at a time rather than all at once. A
 * product that has been selling for a year has a ledger nobody wants delivered
 * in one response, and a history that silently stopped at twenty rows would be
 * worse than one that says how many more there are.
 */
export function InventoryMovementTimeline({
  productId,
  movements: initial,
  totalCount,
  emptyBody,
}: {
  productId: string;
  movements: MovementRow[];
  /** How many exist in total, so the button can name what it will fetch. */
  totalCount: number;
  emptyBody?: string;
}) {
  const [selected, setSelected] = useState<MovementRow | null>(null);

  const [movements, setMovements] = useState(initial);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const remaining = Math.max(0, totalCount - movements.length);

  /**
   * Fetches the next page and appends it.
   *
   * Paged by the same ordering the first page used, so a movement cannot appear
   * twice or be skipped. New movements arriving between pages would shift the
   * window — which is why the page reloads after an adjustment rather than
   * trying to splice one in here.
   */
  async function showOlder() {
    if (loading) return;

    setLoading(true);
    setError(undefined);

    try {
      const next = await getProductMovements(productId, { page: page + 1, limit: PAGE_SIZE });

      setMovements((current) => [...current, ...next.items]);
      setPage((current) => current + 1);
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  if (movements.length === 0) {
    return (
      <AdminEmpty
        icon={History}
        title="No stock movements recorded"
        body={
          emptyBody ??
          'Sales, cancellations and adjustments will appear here as they happen. Products that existed before stock history was introduced start with an empty ledger.'
        }
      />
    );
  }

  const groups = groupByDay(movements, (movement) => movement.createdAt);

  return (
    <>
      <ol className="space-y-1">
        {groups.map((group) => (
          <li key={group.day}>
            <p className="text-caption mt-4 mb-1.5 font-semibold tracking-wide text-muted-foreground uppercase first:mt-0">
              {group.day}
            </p>

            <ol className="space-y-1">
              {group.entries.map((movement) => {
                const up = movement.quantityChange > 0;
                const Icon = up ? PackagePlus : PackageMinus;

                return (
                  <li key={movement.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(movement)}
                      className="focus-ring flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50"
                    >
                      <span
                        className={cn(
                          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                          up ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          {/* The number first: it is what the eye scans for. */}
                          <span className="text-small font-semibold tabular-nums">
                            {signed(movement.quantityChange)} {unit(movement.quantityChange)}
                          </span>
                          <span className="text-small min-w-0 truncate">{movement.summary}</span>
                        </span>

                        <span className="text-caption mt-0.5 block text-muted-foreground">
                          {formatTime(movement.createdAt)}
                          {movement.actor ? ` · ${movement.actor.name}` : ''}
                          {` · ${movement.quantityBefore} → ${movement.quantityAfter}`}
                        </span>

                        {movement.note && (
                          <span className="text-caption mt-0.5 block text-pretty text-muted-foreground italic">
                            “{movement.note}”
                          </span>
                        )}
                      </span>

                      <StatusBadge tone={movementTone(movement.quantityChange)} className="mt-1">
                        {MOVEMENT_LABEL[movement.type]}
                      </StatusBadge>
                    </button>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>

      {remaining > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <Button size="sm" variant="outline" onClick={() => void showOlder()} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" aria-hidden />
                Loading…
              </>
            ) : (
              `Show ${Math.min(remaining, PAGE_SIZE)} older`
            )}
          </Button>

          <p className="text-caption mt-2 text-muted-foreground" aria-live="polite">
            {error ? (
              <span className="text-destructive">{error}</span>
            ) : (
              `${movements.length} of ${totalCount} movements shown`
            )}
          </p>
        </div>
      )}

      <MovementDetailDialog movement={selected} onClose={() => setSelected(null)} />
    </>
  );
}

/**
 * How many older movements one click fetches.
 *
 * Matches the page size the detail endpoint returns first, so the rhythm of
 * the list does not change halfway down it.
 */
const PAGE_SIZE = 20;

function MovementDetailDialog({
  movement,
  onClose,
}: {
  movement: MovementRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={movement !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {movement && (
          <>
            <DialogTitle className="text-h4">
              {signed(movement.quantityChange)} {unit(movement.quantityChange)}
            </DialogTitle>
            <DialogDescription className="text-caption text-muted-foreground">
              {movement.product.name} · SKU {movement.product.sku}
            </DialogDescription>

            <dl className="mt-4 space-y-2.5">
              <Row label="Type">{MOVEMENT_LABEL[movement.type]}</Row>

              {movement.reason && <Row label="Reason">{REASON_LABEL[movement.reason]}</Row>}

              <Row label="Stock before">
                <span className="tabular-nums">{movement.quantityBefore}</span>
              </Row>
              <Row label="Stock after">
                <span className="tabular-nums">{movement.quantityAfter}</span>
              </Row>

              {movement.variant && (movement.variant.color ?? movement.variant.size) && (
                <Row label="Variant">
                  {[movement.variant.color, movement.variant.size].filter(Boolean).join(' · ')}
                </Row>
              )}

              {movement.reference && movement.reference.label && (
                <Row label="Reference">
                  {movement.reference.type === 'ORDER' ? (
                    <Link
                      href={`/admin/orders/${movement.reference.label}`}
                      className="focus-ring rounded-sm font-medium text-brand hover:underline"
                    >
                      {movement.reference.label}
                    </Link>
                  ) : (
                    movement.reference.label
                  )}
                </Row>
              )}

              <Row label="Performed">{formatDateTime(movement.createdAt)}</Row>

              <Row label="By">
                {movement.actor?.name ?? (
                  // Sales and customers' own cancellations have no member of
                  // staff behind them, and saying "System" would imply one.
                  <span className="text-muted-foreground">
                    {movement.type === 'SALE' ? 'A customer order' : 'Not a staff action'}
                  </span>
                )}
              </Row>
            </dl>

            {movement.note && (
              <p className="text-small mt-4 text-pretty rounded-lg bg-surface/60 p-3">
                {movement.note}
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

const unit = (quantityChange: number) => (Math.abs(quantityChange) === 1 ? 'unit' : 'units');

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
