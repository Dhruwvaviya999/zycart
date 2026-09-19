'use client';

import Image from 'next/image';
import { BadgeCheck, Pencil, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { RatingStars } from '@/components/reviews/rating-stars';
import { formatDate } from '@/lib/format';
import type { Review } from '@/types/review';
import { cn } from '@/lib/utils';

/** "Ananya R." → "AR". The server never sends a full surname to build this from. */
function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/**
 * One review.
 *
 * The verified badge is rendered from `review.isVerifiedPurchase`, which the
 * server sets from a delivered order. It is never derived from anything this
 * component can see, because a trust signal the client could fabricate would be
 * worth nothing.
 *
 * Edit and delete appear only on the reader's own review, and only when the
 * caller supplies handlers — the server is still the thing that enforces
 * ownership; this only decides whether a button is worth showing.
 */
export function ReviewCard({
  review,
  onEdit,
  onDelete,
  className,
}: {
  review: Review;
  onEdit?: (review: Review) => void;
  onDelete?: (review: Review) => void;
  className?: string;
}) {
  const mine = review.isMine === true;
  const actionable = mine && (onEdit || onDelete);

  return (
    <article
      className={cn('border-b border-border py-6 first:pt-0 last:border-0 last:pb-0', className)}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Avatar className="size-9 shrink-0">
          {review.author.avatar && <AvatarImage src={review.author.avatar} alt="" />}
          <AvatarFallback className="text-caption">{initials(review.author.name)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="text-small flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            {review.author.name}

            {mine && (
              <span className="text-caption rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                You
              </span>
            )}

            {review.isVerifiedPurchase && (
              <span className="text-caption inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 font-medium text-success">
                <BadgeCheck className="size-3" aria-hidden />
                Verified purchase
              </span>
            )}
          </p>

          <p className="text-caption mt-0.5 text-muted-foreground">
            <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
            {review.edited && <span> · Edited</span>}
          </p>
        </div>

        <RatingStars
          value={review.rating}
          className="shrink-0"
          label={`Rated ${review.rating} out of 5`}
        />
      </div>

      <div className="mt-4 sm:pl-12">
        {review.title && <h4 className="text-small font-semibold">{review.title}</h4>}

        <p
          className={cn(
            'text-small text-pretty whitespace-pre-line text-muted-foreground',
            review.title && 'mt-1.5',
          )}
        >
          {review.comment}
        </p>

        {review.images.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {review.images.map((src) => (
              <li key={src}>
                <span className="relative block size-20 overflow-hidden rounded-xl bg-surface">
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                    // Customer-supplied URLs; a broken one should not break the card.
                    unoptimized
                  />
                </span>
              </li>
            ))}
          </ul>
        )}

        {actionable && (
          <div className="mt-4 flex flex-wrap gap-2">
            {onEdit && (
              <Button size="sm" variant="outline" onClick={() => onEdit(review)}>
                <Pencil className="size-3.5" data-icon="inline-start" aria-hidden />
                Edit
              </Button>
            )}
            {onDelete && (
              <Button size="sm" variant="ghost" onClick={() => onDelete(review)}>
                <Trash2 className="size-3.5" data-icon="inline-start" aria-hidden />
                Delete
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
