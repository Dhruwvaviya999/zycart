'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthError } from '@/components/auth/auth-error';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { humanise, orderStatusTone } from '@/components/admin/status-tones';
import { StatusBadge } from '@/components/admin/admin-ui';
import { toErrorMessage } from '@/services/api';
import { updateOrderStatus } from '@/services/admin.service';
import type { OrderStatus } from '@/types/order';

/**
 * Moving an order along its lifecycle.
 *
 * The buttons come from `allowedStatuses`, which the **server** computed from
 * its own transition graph — the console does not know the rules and does not
 * try to. That is why there is no dropdown of all six statuses here: an
 * operator is never shown a move that would be refused.
 *
 * Cancelling is separated from advancing and asks for confirmation, because it
 * is the one transition that puts stock back and cannot be undone. Everything
 * else is a step forward and takes one click.
 *
 * No optimistic update: this changes inventory and fulfilment state, so the
 * screen waits for the server and then re-renders from it.
 */
export function OrderStatusControl({
  orderNumber,
  status,
  allowed,
}: {
  orderNumber: string;
  status: OrderStatus;
  allowed: OrderStatus[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string>();
  const [cancelling, setCancelling] = useState(false);
  const [note, setNote] = useState('');

  const advance = allowed.filter((next) => next !== 'CANCELLED');
  const canCancel = allowed.includes('CANCELLED');

  async function move(next: OrderStatus) {
    if (busy) return;

    setBusy(next);
    setError(undefined);

    try {
      await updateOrderStatus(orderNumber, next);
      router.refresh();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface/40 p-5">
      <h2 className="text-small font-semibold">Fulfilment</h2>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-caption text-muted-foreground">Currently</span>
        <StatusBadge tone={orderStatusTone(status)}>{humanise(status)}</StatusBadge>
      </div>

      <AuthError message={error} />

      {advance.length === 0 && !canCancel ? (
        <p className="text-caption mt-4 text-pretty text-muted-foreground">
          {status === 'DELIVERED'
            ? 'This order is complete. Delivered is the end of the line.'
            : status === 'CANCELLED'
              ? 'This order was cancelled and cannot be reopened.'
              : 'There is nothing to change from here.'}
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {advance.map((next) => (
            <Button
              key={next}
              size="cta"
              variant="brand"
              onClick={() => move(next)}
              disabled={busy !== null}
              className="w-full"
            >
              {busy === next ? (
                <>
                  <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
                  Updating…
                </>
              ) : (
                <>
                  Mark as {humanise(next).toLowerCase()}
                  <ArrowRight className="size-4" data-icon="inline-end" aria-hidden />
                </>
              )}
            </Button>
          ))}

          {canCancel && (
            <Button
              size="cta"
              variant="outline"
              onClick={() => setCancelling(true)}
              disabled={busy !== null}
              className="w-full"
            >
              <Ban className="size-4" data-icon="inline-start" aria-hidden />
              Cancel order
            </Button>
          )}
        </div>
      )}

      {/* Stated plainly, because it is the question an operator will have. */}
      <p className="text-caption mt-4 text-pretty text-muted-foreground">
        Fulfilment only. Payment state comes from what actually happened at the gateway and cannot
        be set from here.
      </p>

      <ConfirmDialog
        open={cancelling}
        onOpenChange={(open) => {
          if (!open) setNote('');
          setCancelling(open);
        }}
        title="Cancel this order?"
        destructive
        description={
          <>
            <span className="block">
              <strong>{orderNumber}</strong> will be cancelled and any stock it is holding goes back
              to the catalogue. This cannot be undone.
            </span>

            <span className="mt-3 block">
              <label htmlFor="cancel-note" className="text-caption font-medium text-foreground">
                Reason <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="cancel-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Out of stock at the warehouse"
                maxLength={300}
                className="mt-1.5"
              />
            </span>
          </>
        }
        confirmLabel="Cancel order"
        busyLabel="Cancelling…"
        onConfirm={async () => {
          await updateOrderStatus(orderNumber, 'CANCELLED', note);
          setNote('');
          router.refresh();
        }}
      />
    </div>
  );
}
