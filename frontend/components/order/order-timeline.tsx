import { Check, X } from 'lucide-react';
import { buildOrderTimeline, type TimelineStep } from '@/lib/order-timeline';
import { formatDateTime } from '@/lib/format';
import type { Order } from '@/types/order';
import { cn } from '@/lib/utils';

/**
 * Where the order has got to.
 *
 * ## What it will not do
 *
 * Every date here comes from `buildOrderTimeline`, which never invents one. A
 * step that happened at a moment nobody recorded shows the fact and says the
 * date is not recorded; a step that has not happened shows no date at all. That
 * is the difference between a timeline a customer can trust and one that merely
 * looks complete.
 *
 * ## Accessibility
 *
 * The rail — the dots and the connecting line — is decorative and hidden from
 * assistive technology. State is carried in words instead: a completed step
 * reads out its label and its time, the current one appends "current step", and
 * an upcoming one appends "not yet". Nothing here is communicated by colour or
 * by icon alone, so the list is as legible to a screen reader as it is on
 * screen, and the same is true in a high-contrast or forced-colours mode.
 */
export function OrderTimeline({ order }: { order: Order }) {
  const steps = buildOrderTimeline(order);
  const cancelled = order.status === 'CANCELLED';

  return (
    <ol
      className={cn(
        'rounded-2xl border p-5',
        cancelled ? 'border-destructive/25 bg-destructive/5' : 'border-border',
      )}
    >
      {steps.map((step, index) => (
        <Step key={step.key} step={step} last={index === steps.length - 1} />
      ))}
    </ol>
  );
}

function Step({ step, last }: { step: TimelineStep; last: boolean }) {
  const done = step.state === 'done';
  const current = step.state === 'current';
  const cancelled = step.key === 'cancelled';

  return (
    <li className="flex gap-3.5">
      {/* Decorative: the state is in the text, not in this. */}
      <div aria-hidden className="flex flex-col items-center">
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
            cancelled
              ? 'border-destructive bg-destructive text-background'
              : done
                ? 'border-brand bg-brand text-brand-foreground'
                : current
                  ? 'border-brand bg-background'
                  : 'border-border bg-background',
          )}
        >
          {cancelled ? (
            <X className="size-3" />
          ) : done ? (
            <Check className="size-3" />
          ) : current ? (
            <span className="size-2 rounded-full bg-brand" />
          ) : null}
        </span>

        {!last && (
          <span className={cn('w-0.5 flex-1', done ? 'bg-brand' : 'bg-border')} />
        )}
      </div>

      <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-6')}>
        <p
          className={cn(
            'text-small font-medium',
            cancelled
              ? 'text-destructive'
              : done || current
                ? 'text-foreground'
                : 'text-muted-foreground',
          )}
        >
          {step.label}
          {/* The state, in words, for anyone not looking at the rail. */}
          {current && <span className="sr-only"> — current step</span>}
          {step.state === 'expected' && <span className="sr-only"> — not yet</span>}
        </p>

        {step.at && (
          <p className="text-caption mt-0.5 tabular-nums text-muted-foreground">
            {formatDateTime(step.at)}
          </p>
        )}

        {step.detail && (
          <p className="text-caption mt-0.5 text-pretty text-muted-foreground">{step.detail}</p>
        )}

        {current && !cancelled && (
          <p className="text-caption mt-0.5 font-medium text-brand">Where your order is now</p>
        )}
      </div>
    </li>
  );
}
