import { Check, X } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import type { ReturnRequest } from '@/types/fulfillment';
import { cn } from '@/lib/utils';

interface Step {
  key: string;
  label: string;
  at: string | null;
  state: 'done' | 'current' | 'expected' | 'stopped';
  detail?: string;
}

/**
 * A return's history, from timestamps the server actually stored.
 *
 * The same rule the order timeline follows, and for the same reason: every step
 * below either carries the moment it was recorded or carries none. There is no
 * interpolation and no "probably around then".
 *
 * A rejected or withdrawn request stops rather than continuing greyed-out to
 * "Refunded" — a track that implies a refund is still coming would be actively
 * misleading to somebody who has just been told no.
 */
function build(request: ReturnRequest): Step[] {
  const steps: Step[] = [
    { key: 'requested', label: 'Return requested', at: request.requestedAt, state: 'done' },
  ];

  if (request.status === 'CANCELLED') {
    steps.push({
      key: 'cancelled',
      label: 'Withdrawn by you',
      at: request.cancelledAt,
      state: 'stopped',
    });
    return steps;
  }

  if (request.status === 'REJECTED') {
    steps.push({
      key: 'rejected',
      label: 'Not approved',
      at: request.decidedAt,
      state: 'stopped',
      detail: request.resolutionNote || undefined,
    });
    return steps;
  }

  steps.push({
    key: 'approved',
    label: 'Approved',
    at: request.decidedAt,
    state: request.decidedAt ? (request.status === 'APPROVED' ? 'current' : 'done') : 'expected',
    detail: request.status === 'APPROVED' ? 'Send the items back to us.' : undefined,
  });

  steps.push({
    key: 'received',
    label: 'Items received',
    at: request.receivedAt,
    state: request.receivedAt ? (request.status === 'RECEIVED' ? 'current' : 'done') : 'expected',
  });

  steps.push({
    key: 'refund-sent',
    label: 'Refund sent',
    at: request.refund.initiatedAt,
    state: request.refund.initiatedAt
      ? request.status === 'REFUND_PENDING'
        ? 'current'
        : 'done'
      : 'expected',
  });

  steps.push({
    key: 'refunded',
    label: 'Refund completed',
    at: request.refund.completedAt,
    state: request.refund.completedAt ? 'done' : 'expected',
  });

  return steps;
}

export function ReturnTimeline({ request }: { request: ReturnRequest }) {
  const steps = build(request);
  const stopped = steps.some((step) => step.state === 'stopped');

  return (
    <ol
      className={cn(
        'rounded-2xl border p-5',
        stopped ? 'border-destructive/25 bg-destructive/5' : 'border-border',
      )}
    >
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const done = step.state === 'done';
        const current = step.state === 'current';
        const halted = step.state === 'stopped';

        return (
          <li key={step.key} className="flex gap-3.5">
            {/* Decorative. Every bit of state below is also in words. */}
            <div aria-hidden className="flex flex-col items-center">
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full border-2',
                  halted
                    ? 'border-destructive bg-destructive text-background'
                    : done
                      ? 'border-brand bg-brand text-brand-foreground'
                      : current
                        ? 'border-brand bg-background'
                        : 'border-border bg-background',
                )}
              >
                {halted ? (
                  <X className="size-3" />
                ) : done ? (
                  <Check className="size-3" />
                ) : current ? (
                  <span className="size-2 rounded-full bg-brand" />
                ) : null}
              </span>
              {!last && <span className={cn('w-0.5 flex-1', done ? 'bg-brand' : 'bg-border')} />}
            </div>

            <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-6')}>
              <p
                className={cn(
                  'text-small font-medium',
                  halted
                    ? 'text-destructive'
                    : done || current
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                )}
              >
                {step.label}
                {current && <span className="sr-only"> — current step</span>}
                {step.state === 'expected' && <span className="sr-only"> — not yet</span>}
              </p>

              {step.at && (
                <p className="text-caption mt-0.5 tabular-nums text-muted-foreground">
                  {formatDateTime(step.at)}
                </p>
              )}

              {step.detail && (
                <p className="text-caption mt-0.5 text-pretty text-muted-foreground">
                  {step.detail}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
