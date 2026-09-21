import { Check, Clock, PackageCheck, Truck, X, type LucideIcon } from 'lucide-react';
import type { OrderStatus } from '@/types/order';
import { cn } from '@/lib/utils';

/** Status carries an icon and a word, never colour alone. */
const STATUS: Record<OrderStatus, { label: string; className: string; icon: LucideIcon }> = {
  PENDING: { label: 'Pending', className: 'bg-muted text-muted-foreground', icon: Clock },
  CONFIRMED: { label: 'Confirmed', className: 'bg-brand-subtle text-brand', icon: Check },
  PROCESSING: { label: 'Processing', className: 'bg-brand-subtle text-brand', icon: PackageCheck },
  SHIPPED: { label: 'Shipped', className: 'bg-brand-subtle text-brand', icon: Truck },
  DELIVERED: { label: 'Delivered', className: 'bg-success/12 text-success', icon: Check },
  CANCELLED: { label: 'Cancelled', className: 'bg-destructive/10 text-destructive', icon: X },
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const { label, className: tone, icon: Icon } = STATUS[status];

  return (
    <span
      className={cn(
        'text-caption inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold',
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

export const statusLabel = (status: OrderStatus): string => STATUS[status].label;
