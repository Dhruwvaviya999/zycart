import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-5',
} as const;

/**
 * Five stars, read-only.
 *
 * The stars are `aria-hidden` and the rating is announced as a sentence
 * instead, because "star star star half-star star" is not information. Colour
 * is never the only signal either — a filled star differs in shape as well as
 * hue, which matters for the roughly one reader in twelve who cannot rely on
 * the difference between amber and grey.
 */
export function RatingStars({
  value,
  size = 'sm',
  className,
  label,
}: {
  value: number;
  size?: keyof typeof SIZES;
  className?: string;
  /** Overrides the announced text; pass `null` inside an already-labelled element. */
  label?: string | null;
}) {
  const rounded = Math.round(value);

  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      {...(label === null
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': label ?? `Rated ${value} out of 5` })}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden
          className={cn(
            SIZES[size],
            star <= rounded
              ? 'fill-amber-400 text-amber-400'
              : 'fill-muted text-muted-foreground/40',
          )}
        />
      ))}
    </span>
  );
}
