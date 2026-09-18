import type { ProductBadge } from '@/types/product';
import { cn } from '@/lib/utils';

const styles: Record<ProductBadge, { label: string; className: string }> = {
  sale: { label: 'Sale', className: 'bg-sale text-sale-foreground' },
  new: { label: 'New', className: 'bg-brand text-brand-foreground' },
  bestseller: { label: 'Bestseller', className: 'bg-foreground text-background' },
  limited: {
    label: 'Limited',
    className: 'bg-background/85 text-foreground ring-1 ring-border backdrop-blur-sm',
  },
};

interface ProductBadgeChipProps {
  badge: ProductBadge;
  className?: string;
}

export function ProductBadgeChip({ badge, className }: ProductBadgeChipProps) {
  const { label, className: tone } = styles[badge];

  return (
    <span
      className={cn(
        'text-label inline-flex h-[22px] items-center rounded-full px-2.5 shadow-xs',
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
