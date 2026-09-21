import { Check, Clock, CircleAlert, RotateCcw, Undo2, Wallet, type LucideIcon } from 'lucide-react';
import type { PaymentMethod, PaymentStatus } from '@/types/order';
import { cn } from '@/lib/utils';

/**
 * How each payment state reads to a customer.
 *
 * `label` is written for the badge; `explain` is the sentence that goes beside
 * it on an order page, where the question is really "has my money gone?". The
 * internal names — AUTHORIZED, REFUND_PENDING — never reach the screen.
 */
const STATUS: Record<
  PaymentStatus,
  { label: string; explain: string; className: string; icon: LucideIcon }
> = {
  PENDING: {
    label: 'Not paid',
    explain: 'No payment has been taken yet.',
    className: 'bg-muted text-muted-foreground',
    icon: Clock,
  },
  AUTHORIZED: {
    label: 'Confirming',
    explain: 'Your bank has approved the payment and we are confirming it.',
    className: 'bg-muted text-muted-foreground',
    icon: Clock,
  },
  PAID: {
    label: 'Paid',
    explain: 'Payment received in full.',
    className: 'bg-success/12 text-success',
    icon: Check,
  },
  FAILED: {
    label: 'Payment failed',
    explain: 'The payment did not go through, so nothing has been charged.',
    className: 'bg-destructive/10 text-destructive',
    icon: CircleAlert,
  },
  REFUND_PENDING: {
    label: 'Refund in progress',
    explain: 'We are returning your payment to its original method.',
    className: 'bg-muted text-muted-foreground',
    icon: RotateCcw,
  },
  REFUNDED: {
    label: 'Refunded',
    explain: 'Your payment has been returned in full.',
    className: 'bg-muted text-muted-foreground',
    icon: Undo2,
  },
};

const METHOD: Record<PaymentMethod, string> = {
  COD: 'Cash on delivery',
  RAZORPAY: 'Online payment',
};

export const paymentMethodLabel = (method: PaymentMethod): string => METHOD[method] ?? method;

export function paymentStatusLabel(status: PaymentStatus, method: PaymentMethod): string {
  // For cash on delivery, "not paid" is the normal state and reads as a problem
  // unless it says why.
  if (status === 'PENDING' && method === 'COD') return 'Pay on delivery';
  return STATUS[status]?.label ?? status;
}

export function paymentStatusExplanation(status: PaymentStatus, method: PaymentMethod): string {
  if (status === 'PENDING' && method === 'COD') {
    return 'Payable in cash when your order arrives.';
  }
  return STATUS[status]?.explain ?? '';
}

/** Icon plus words, never colour alone. */
export function PaymentStatusBadge({
  status,
  method,
  className,
}: {
  status: PaymentStatus;
  method: PaymentMethod;
  className?: string;
}) {
  const entry = STATUS[status];
  const codPending = status === 'PENDING' && method === 'COD';

  const Icon = codPending ? Wallet : (entry?.icon ?? Clock);
  const tone = codPending
    ? 'bg-muted text-muted-foreground'
    : (entry?.className ?? 'bg-muted text-muted-foreground');

  return (
    <span
      className={cn(
        'text-caption inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold',
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {paymentStatusLabel(status, method)}
    </span>
  );
}
