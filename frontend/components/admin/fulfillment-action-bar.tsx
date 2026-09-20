import Link from 'next/link';
import { ArrowRight, CircleCheck, Clock, Package, RotateCcw, Truck } from 'lucide-react';
import { SHIPMENT_ADMIN_LABEL } from '@/types/fulfillment';
import type { AdminOrderDetail } from '@/types/admin';
import { cn } from '@/lib/utils';

/**
 * What to do with this order, right now.
 *
 * ## Deterministic, and deliberately so
 *
 * No AI, no scoring, no ranking. The next action is a pure function of three
 * stored facts — the order's status, the payment's status and the parcel's
 * status — and it is written out below as an ordered list of conditions. An
 * operator can read this file and predict exactly what the bar will say for any
 * order, which is the property that makes it trustworthy enough to act on
 * without checking.
 *
 * ## It describes rather than acts
 *
 * The bar names the next step and points at the control that performs it; it
 * does not perform it itself. That is on purpose: the controls below already
 * carry their own confirmations, their own error states and — crucially — the
 * server's own list of what is permitted. A duplicate button up here would be a
 * second path into the same transition, free to drift from the first.
 *
 * The one exception is returns, which link out to the return queue, because
 * that decision does not belong on an order page.
 */
export function FulfillmentActionBar({ order }: { order: AdminOrderDetail }) {
  const step = nextStep(order);

  return (
    <section
      aria-label="Next action"
      className={cn(
        'mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-4',
        step.tone === 'done'
          ? 'border-success/30 bg-success/5'
          : step.tone === 'waiting'
            ? 'border-border bg-surface/40'
            : 'border-brand/30 bg-brand-subtle/20',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg',
          step.tone === 'done'
            ? 'bg-success/12 text-success'
            : step.tone === 'waiting'
              ? 'bg-muted text-muted-foreground'
              : 'bg-brand-subtle text-brand',
        )}
      >
        <step.icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-small font-semibold">{step.headline}</p>
        <p className="text-caption mt-0.5 text-pretty text-muted-foreground">{step.detail}</p>
      </div>

      {step.link && (
        <Link
          href={step.link.href}
          className="focus-ring text-small inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium text-brand underline-offset-4 hover:underline"
        >
          {step.link.label}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </section>
  );
}

interface Step {
  headline: string;
  detail: string;
  tone: 'action' | 'waiting' | 'done';
  icon: typeof Package;
  link?: { href: string; label: string };
}

/**
 * The rules, in priority order.
 *
 * Read top to bottom: the first condition that matches wins. The ordering is
 * the judgement — a return awaiting review outranks a parcel in transit,
 * because the parcel is somebody else's problem for the next two days and the
 * return is this operator's now.
 */
function nextStep(order: AdminOrderDetail): Step {
  const openReturns = order.returns.filter(
    (request) => request.status === 'REQUESTED' || request.status === 'RECEIVED',
  );

  // Returns first: they are the only thing here with a customer waiting on a
  // decision rather than on a courier.
  if (openReturns.length > 0) {
    const first = openReturns[0];

    return {
      headline:
        openReturns.length === 1
          ? first?.status === 'REQUESTED'
            ? 'A return is waiting for review'
            : 'Returned goods are waiting for a refund'
          : `${String(openReturns.length)} returns need attention`,
      detail: 'Open the return to approve, reject or refund it.',
      tone: 'action',
      icon: RotateCcw,
      link: first
        ? { href: `/admin/returns/${first.returnNumber}`, label: 'Open return' }
        : undefined,
    };
  }

  if (order.status === 'CANCELLED') {
    return {
      headline: 'Cancelled',
      detail:
        order.payment.refundedAmount > 0
          ? 'Any stock it was holding has been returned, and a refund has been issued.'
          : 'Any stock it was holding has been returned. Nothing further to do.',
      tone: 'done',
      icon: CircleCheck,
    };
  }

  if (order.status === 'PENDING') {
    return {
      headline:
        order.payment.status === 'FAILED' ? 'The payment failed' : 'Waiting for payment',
      detail:
        order.payment.method === 'COD'
          ? 'This order has not been confirmed yet. Confirm it to start fulfilment.'
          : 'Nothing to pack until the payment confirms. The customer can retry from their order page.',
      tone: 'waiting',
      icon: Clock,
    };
  }

  if (order.status === 'DELIVERED') {
    return {
      headline: 'Delivered',
      detail: 'Fulfilment is complete. Returns stay open for the customer’s return window.',
      tone: 'done',
      icon: CircleCheck,
    };
  }

  const shipment = order.shipment;

  if (!shipment) {
    return order.fulfillment.canCreateShipment
      ? {
          headline:
            order.status === 'CONFIRMED' ? 'Ready to be picked' : 'Ready for a shipment',
          detail:
            'Create a shipment to record the carrier and tracking details, then mark it dispatched.',
          tone: 'action',
          icon: Package,
        }
      : {
          headline: 'No shipment on record',
          detail:
            order.fulfillment.createBlockedReason ||
            'This order has no parcel and one cannot be created now.',
          tone: 'waiting',
          icon: Package,
        };
  }

  if (shipment.status === 'EXCEPTION') {
    return {
      headline: 'The parcel has a problem',
      detail:
        shipment.note ||
        'The carrier reported an exception. Contact them or the customer, then update the parcel.',
      tone: 'action',
      icon: Truck,
    };
  }

  if (shipment.status === 'READY_TO_SHIP') {
    return {
      headline: 'Packed and waiting for the carrier',
      detail: 'Mark it shipped once it has been handed over — the order follows automatically.',
      tone: 'action',
      icon: Truck,
    };
  }

  return {
    headline: `Parcel is ${SHIPMENT_ADMIN_LABEL[shipment.status].toLowerCase()}`,
    detail: shipment.estimatedDeliveryAt
      ? 'Update the parcel as it moves, or mark it delivered when it arrives.'
      : 'No delivery estimate was given. Update the parcel as it moves.',
    tone: 'waiting',
    icon: Truck,
  };
}
