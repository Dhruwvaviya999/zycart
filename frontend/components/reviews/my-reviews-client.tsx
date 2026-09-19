'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Clock, EyeOff, Pencil, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { DeleteReviewDialog } from '@/components/reviews/delete-review-dialog';
import { RatingStars } from '@/components/reviews/rating-stars';
import { ReviewDialog } from '@/components/reviews/review-dialog';
import { formatDate } from '@/lib/format';
import type { MyReview } from '@/types/review';
import type { Pagination } from '@/types/product';
import { cn } from '@/lib/utils';

/**
 * Everything this customer has written.
 *
 * Status is surfaced here and nowhere else: a review awaiting moderation, or
 * one that was removed, is something its author is entitled to know about, but
 * it has no business appearing on the public product page.
 *
 * Editing and deleting reuse the same dialogs as the product page, so the task
 * is learned once.
 */
export function MyReviewsClient({
  initialReviews,
  pagination,
}: {
  initialReviews: MyReview[];
  pagination: Pagination;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [editing, setEditing] = useState<MyReview | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title="You haven't written a review yet."
        body="Once an order has been delivered, you can share how it worked out. Reviews from customers who actually received the product are the ones worth reading."
        action={{ label: 'View your orders', href: '/account/orders' }}
        secondaryAction={{ label: 'Continue shopping', href: '/shop' }}
      />
    );
  }

  return (
    <>
      <ul className="space-y-4">
        {reviews.map((review) => (
          <li key={review.id}>
            <article className="rounded-2xl border border-border p-5 transition-colors hover:border-foreground/25">
              <div className="flex flex-wrap items-start gap-4">
                <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface">
                  {review.product.image && (
                    <Image
                      src={review.product.image}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="text-small font-semibold">
                    {review.product.slug ? (
                      <Link
                        href={`/products/${review.product.slug}`}
                        className="focus-ring rounded-sm"
                      >
                        {review.product.name}
                      </Link>
                    ) : (
                      review.product.name
                    )}
                  </h3>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <RatingStars
                      value={review.rating}
                      label={`You rated this ${review.rating} out of 5`}
                    />
                    <span className="text-caption text-muted-foreground">
                      <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
                      {review.edited && ' · Edited'}
                    </span>
                    <StatusChip status={review.status} />
                  </div>
                </div>
              </div>

              <div className="mt-4">
                {review.title && <p className="text-small font-semibold">{review.title}</p>}
                <p
                  className={cn(
                    'text-small text-pretty whitespace-pre-line text-muted-foreground',
                    review.title && 'mt-1.5',
                  )}
                >
                  {review.comment}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                <Button size="sm" variant="outline" onClick={() => setEditing(review)}>
                  <Pencil className="size-3.5" data-icon="inline-start" aria-hidden />
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeletingId(review.id)}>
                  <Trash2 className="size-3.5" data-icon="inline-start" aria-hidden />
                  Delete
                </Button>
              </div>
            </article>
          </li>
        ))}
      </ul>

      {pagination.totalPages > 1 && (
        <p className="text-caption mt-6 text-center text-muted-foreground">
          Showing {reviews.length} of {pagination.total} reviews
        </p>
      )}

      <ReviewDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        productId={editing?.product.id ?? ''}
        productName={editing?.product.name ?? ''}
        existing={editing}
        onSaved={(saved) => {
          setReviews((current) =>
            current.map((review) =>
              review.id === saved.id ? { ...review, ...saved, product: review.product } : review,
            ),
          );
          setEditing(null);
        }}
      />

      <DeleteReviewDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
        reviewId={deletingId}
        onDeleted={(id) => {
          setReviews((current) => current.filter((review) => review.id !== id));
          setDeletingId(null);
        }}
      />
    </>
  );
}

/**
 * Moderation state, shown only to the author.
 *
 * An approved review gets no chip at all — that is the normal case, and a green
 * "Published" badge on every row would be noise. Icon plus words, never colour
 * alone.
 */
function StatusChip({ status }: { status: MyReview['status'] }) {
  if (status === 'APPROVED') return null;

  const pending = status === 'PENDING';
  const Icon = pending ? Clock : EyeOff;

  return (
    <span
      className={cn(
        'text-caption inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium',
        pending ? 'bg-muted text-muted-foreground' : 'bg-destructive/10 text-destructive',
      )}
    >
      <Icon className="size-3" aria-hidden />
      {pending ? 'Awaiting review' : 'Not shown publicly'}
    </span>
  );
}
