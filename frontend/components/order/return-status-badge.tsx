import {
  Check,
  CircleAlert,
  Clock,
  PackageCheck,
  RotateCcw,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { RETURN_STATUS_COPY, type ReturnStatus } from '@/types/fulfillment';
import { cn } from '@/lib/utils';

/**
 * A return's state, as an icon and a word.
 *
 * Never colour alone — the same rule every status badge in ZyCart follows, and
 * the reason each entry below carries an icon as well as a tone. The label
 * comes from `RETURN_STATUS_COPY`, so the badge and the explanation beside it
 * on a return page cannot say different things.
 */
const TONE: Record<ReturnStatus, { className: string; icon: LucideIcon }> = {
  REQUESTED: { className: 'bg-muted text-muted-foreground', icon: Clock },
  APPROVED: { className: 'bg-brand-subtle text-brand', icon: Check },
  REJECTED: { className: 'bg-destructive/10 text-destructive', icon: X },
  RECEIVED: { className: 'bg-brand-subtle text-brand', icon: PackageCheck },
  REFUND_PENDING: { className: 'bg-amber-400/15 text-amber-700 dark:text-amber-300', icon: RotateCcw },
  REFUNDED: { className: 'bg-success/12 text-success', icon: Undo2 },
  CANCELLED: { className: 'bg-muted text-muted-foreground', icon: CircleAlert },
};

export function ReturnStatusBadge({
  status,
  className,
}: {
  status: ReturnStatus;
  className?: string;
}) {
  const { className: tone, icon: Icon } = TONE[status];

  return (
    <span
      className={cn(
        'text-caption inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold',
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {RETURN_STATUS_COPY[status].label}
    </span>
  );
}
