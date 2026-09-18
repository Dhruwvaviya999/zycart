import { Star } from 'lucide-react';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

interface RatingProps {
  value: number;
  reviewCount?: number;
  /** Renders five stars instead of the compact single-star chip. */
  showStars?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function Rating({
  value,
  reviewCount,
  showStars = false,
  size = 'sm',
  className,
}: RatingProps) {
  const starSize = size === 'sm' ? 'size-3.5' : 'size-4';
  const label = `Rated ${value} out of 5${reviewCount ? ` from ${reviewCount} reviews` : ''}`;

  return (
    <div className={cn('flex items-center gap-1.5', className)} aria-label={label}>
      {showStars ? (
        <span className="flex items-center gap-0.5" aria-hidden>
          {[0, 1, 2, 3, 4].map((index) => (
            <Star
              key={index}
              className={cn(
                starSize,
                index < Math.round(value)
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-muted text-muted-foreground/40',
              )}
            />
          ))}
        </span>
      ) : (
        <Star className={cn(starSize, 'fill-amber-400 text-amber-400')} aria-hidden />
      )}

      <span className={cn('font-medium', size === 'sm' ? 'text-caption' : 'text-small')}>
        {value.toFixed(1)}
      </span>

      {reviewCount !== undefined && (
        <span
          className={cn('text-muted-foreground', size === 'sm' ? 'text-caption' : 'text-small')}
        >
          ({formatCount(reviewCount)})
        </span>
      )}
    </div>
  );
}
