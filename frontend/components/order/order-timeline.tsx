import { Check, X } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { statusLabel } from '@/components/order/order-status-badge';
import { ORDER_PROGRESSION, type OrderStatus } from '@/types/order';
import { cn } from '@/lib/utils';

interface OrderTimelineProps {
  status: OrderStatus;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
}

/**
 * Where the order has got to.
 *
 * A cancelled order leaves the progression rather than sitting at some point
 * along it, so it gets its own treatment instead of a greyed-out track that
 * would imply it is still on the way.
 */
export function OrderTimeline({ status, cancelledAt, cancellationReason }: OrderTimelineProps) {
  if (status === 'CANCELLED') {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
          <X className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-small font-semibold text-destructive">Order cancelled</p>
          {cancelledAt && (
            <p className="text-caption mt-0.5 text-muted-foreground">
              Cancelled on {formatDate(cancelledAt)}
            </p>
          )}
          {cancellationReason && (
            <p className="text-caption mt-1.5 text-muted-foreground">
              Reason: {cancellationReason}
            </p>
          )}
        </div>
      </div>
    );
  }

  const reached = ORDER_PROGRESSION.indexOf(status);

  return (
    <ol className="rounded-2xl border border-border p-5">
      {ORDER_PROGRESSION.map((step, index) => {
        const done = index <= reached;
        const current = index === reached;
        const last = index === ORDER_PROGRESSION.length - 1;

        return (
          <li key={step} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
                  done
                    ? 'border-brand bg-brand text-brand-foreground'
                    : 'border-border bg-background',
                )}
              >
                {done && <Check className="size-3" />}
              </span>
              {!last && (
                <span
                  aria-hidden
                  className={cn('w-0.5 flex-1', index < reached ? 'bg-brand' : 'bg-border')}
                />
              )}
            </div>

            <div className={cn('min-w-0', last ? 'pb-0' : 'pb-6')}>
              <p
                className={cn(
                  'text-small font-medium',
                  current ? 'text-foreground' : done ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {statusLabel(step)}
                {current && <span className="sr-only"> — current status</span>}
              </p>
              {current && <p className="text-caption mt-0.5 text-brand">Where your order is now</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
