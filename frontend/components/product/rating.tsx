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

/**
 * A product's rating, as it appears on cards and the purchase panel.
 *
 * From Phase 8 a rating is derived from real, purchase-verified reviews, so an
 * unreviewed product genuinely has none — and says so rather than rendering
 * "0.0" beside five empty stars, which reads as a terrible product instead of a
 * new one.
 */
export function Rating({
  value,
  reviewCount,
  showStars = false,
  size = 'sm',
  className,
}: RatingProps) {
  const starSize = size === 'sm' ? 'size-3.5' : 'size-4';
  const textSize = size === 'sm' ? 'text-caption' : 'text-small';

  // `reviewCount` is optional, so an absent count falls back to the rating
  // itself: a product with no rating has nothing to show.
  const unrated = reviewCount !== undefined ? reviewCount === 0 : value <= 0;

  if (unrated) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        {showStars && (
          <span className="flex items-center gap-0.5" aria-hidden>
            {[0, 1, 2, 3, 4].map((index) => (
              <Star key={index} className={cn(starSize, 'fill-muted text-muted-foreground/40')} />
            ))}
          </span>
        )}
        <span className={cn(textSize, 'text-muted-foreground')}>No reviews yet</span>
      </div>
    );
  }

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

      <span className={cn('font-medium', textSize)}>{value.toFixed(1)}</span>

      {reviewCount !== undefined && (
        <span className={cn('text-muted-foreground', textSize)}>({formatCount(reviewCount)})</span>
      )}
    </div>
  );
}
