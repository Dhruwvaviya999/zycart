'use client';

import { RatingStars } from '@/components/reviews/rating-stars';
import type { RatingDistribution, RatingValue } from '@/types/review';
import { cn } from '@/lib/utils';

/**
 * The rating at a glance: the average, how many people said it, and how the
 * opinion is distributed.
 *
 * The distribution is the part that earns its place. An average of 4.2 built
 * from forty fives and ten ones is a different product from one built entirely
 * from fours, and only the bars show that.
 *
 * Each bar is a button that filters the list to that star, so scanning the
 * distribution and acting on it are the same gesture. When no handler is passed
 * the bars render as plain rows rather than as buttons that do nothing.
 */
export function RatingSummary({
  averageRating,
  reviewCount,
  distribution,
  activeRating,
  onSelectRating,
  className,
}: {
  averageRating: number;
  reviewCount: number;
  distribution: RatingDistribution;
  activeRating?: RatingValue | null;
  onSelectRating?: (rating: RatingValue | null) => void;
  className?: string;
}) {
  const stars: RatingValue[] = [5, 4, 3, 2, 1];

  return (
    <div className={cn('rounded-2xl border border-border bg-surface p-6', className)}>
      {reviewCount === 0 ? (
        <>
          <p className="text-h3">No ratings yet</p>
          <RatingStars value={0} size="md" className="mt-2" label={null} />
          <p className="text-caption mt-3 text-pretty text-muted-foreground">
            This product has not been reviewed yet.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <p className="text-price-lg">{averageRating.toFixed(1)}</p>
            <span className="text-caption text-muted-foreground">out of 5</span>
          </div>

          <RatingStars
            value={averageRating}
            size="md"
            className="mt-2"
            label={`Rated ${averageRating.toFixed(1)} out of 5 from ${reviewCount} reviews`}
          />

          <p className="text-caption mt-3 text-muted-foreground">
            {reviewCount.toLocaleString('en-IN')} {reviewCount === 1 ? 'review' : 'reviews'}
          </p>

          <ul className="mt-5 space-y-1.5">
            {stars.map((star) => {
              const count = distribution[String(star) as keyof RatingDistribution] ?? 0;
              const percent = reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0;
              const active = activeRating === star;

              const row = (
                <>
                  <span className="text-caption w-9 shrink-0 text-left tabular-nums">{star} ★</span>

                  <span
                    aria-hidden
                    className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                  >
                    <span
                      className="block h-full rounded-full bg-amber-400 transition-[width] duration-500 ease-(--ease-brand)"
                      style={{ width: `${percent}%` }}
                    />
                  </span>

                  <span className="text-caption w-9 shrink-0 text-right tabular-nums text-muted-foreground">
                    {percent}%
                  </span>
                </>
              );

              if (!onSelectRating) {
                return (
                  <li key={star} className="flex items-center gap-2.5">
                    {row}
                    <span className="sr-only">
                      {count} {count === 1 ? 'review' : 'reviews'}
                    </span>
                  </li>
                );
              }

              return (
                <li key={star}>
                  <button
                    type="button"
                    // Toggles: pressing the active bar clears the filter, which
                    // is what people expect from a filter they can see is on.
                    onClick={() => onSelectRating(active ? null : star)}
                    aria-pressed={active}
                    className={cn(
                      'focus-ring flex w-full items-center gap-2.5 rounded-md px-1 py-1 transition-colors',
                      active ? 'bg-brand-subtle/50' : 'hover:bg-muted/60',
                    )}
                  >
                    {row}
                    <span className="sr-only">
                      {count} {count === 1 ? 'review' : 'reviews'}. Show only {star} star reviews.
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
