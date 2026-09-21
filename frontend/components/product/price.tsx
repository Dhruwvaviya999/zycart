import { discountPercent, formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

interface PriceProps {
  price: number;
  compareAtPrice?: number | null;
  size?: 'default' | 'lg';
  /** Hides the percentage chip where a separate badge already shows it. */
  hideDiscount?: boolean;
  className?: string;
}

export function Price({
  price,
  compareAtPrice,
  size = 'default',
  hideDiscount = false,
  className,
}: PriceProps) {
  const percent = discountPercent(price, compareAtPrice);
  const large = size === 'lg';

  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1', className)}>
      <span className={large ? 'text-price-lg' : 'text-price'}>{formatPrice(price)}</span>

      {percent > 0 && compareAtPrice && (
        <>
          <span
            className={cn('text-muted-foreground line-through', large ? 'text-body' : 'text-small')}
          >
            {formatPrice(compareAtPrice)}
          </span>
          {!hideDiscount && (
            <span className={cn('font-semibold text-sale', large ? 'text-small' : 'text-caption')}>
              {percent}% off
            </span>
          )}
        </>
      )}
    </div>
  );
}
