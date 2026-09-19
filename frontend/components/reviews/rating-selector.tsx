'use client';

import { useId, useState } from 'react';
import { Star } from 'lucide-react';
import type { RatingValue } from '@/types/review';
import { RATING_VALUES } from '@/types/review';
import { cn } from '@/lib/utils';

const WORDS: Record<RatingValue, string> = {
  1: 'Poor',
  2: 'Not great',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent',
};

/**
 * Choosing a rating.
 *
 * Native radio inputs sharing a name, grouped by a fieldset — so arrow keys
 * move between the stars, space selects, and a screen reader announces "Good, 4
 * of 5" without a line of ARIA. A div-with-onClick star picker, which is the
 * usual implementation, is unreachable by keyboard and silent to a screen
 * reader.
 *
 * Hover previews the rating on a pointer, but hover is only ever decoration
 * here: the selected value shows through filled stars and a word, both of which
 * survive on a touch screen where hover does not exist. Each star is a 44px tap
 * target, because the difference between three and four stars should not depend
 * on thumb precision.
 */
export function RatingSelector({
  value,
  onChange,
  disabled = false,
  invalid = false,
  describedBy,
}: {
  value: RatingValue | null;
  onChange: (rating: RatingValue) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const name = useId();
  const [hovered, setHovered] = useState<RatingValue | null>(null);

  // What the stars show right now: the pointer's preview if there is one,
  // otherwise the actual choice.
  const shown = hovered ?? value;

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-small font-medium">How would you rate this product?</legend>

      {/* `aria-invalid` belongs on the group, not on the radios: it is not a
          supported attribute of role="radio", and the thing that is invalid is
          the choice, not any one star. */}
      <div
        className={cn(
          'mt-3 flex flex-wrap items-center gap-1 rounded-lg',
          invalid && 'ring-2 ring-destructive/40',
        )}
        onMouseLeave={() => setHovered(null)}
      >
        {RATING_VALUES.map((star) => {
          const filled = shown !== null && star <= shown;
          const selected = value === star;

          return (
            <label
              key={star}
              onMouseEnter={() => setHovered(star)}
              className={cn(
                'focus-within:ring-ring/45 grid size-11 place-items-center rounded-lg transition-colors focus-within:ring-[3px]',
                disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-muted/60',
                selected && 'bg-amber-400/10',
              )}
            >
              <input
                type="radio"
                name={name}
                value={star}
                checked={selected}
                onChange={() => onChange(star)}
                aria-describedby={describedBy}
                className="sr-only"
              />

              <Star
                aria-hidden
                className={cn(
                  'size-7 transition-colors',
                  filled
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-transparent text-muted-foreground/50',
                )}
              />

              {/* The only accessible name each radio has; the stars are decoration. */}
              <span className="sr-only">
                {star} {star === 1 ? 'star' : 'stars'} — {WORDS[star]}
              </span>
            </label>
          );
        })}

        {/* Words as well as stars, so the choice is never carried by colour alone. */}
        <span
          aria-hidden
          className={cn(
            'text-small ml-2 font-medium transition-opacity',
            shown === null ? 'opacity-0' : 'opacity-100',
          )}
        >
          {shown === null ? 'Excellent' : WORDS[shown]}
        </span>
      </div>
    </fieldset>
  );
}
