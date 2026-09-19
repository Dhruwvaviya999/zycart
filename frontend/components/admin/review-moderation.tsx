'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BadgeCheck, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthError } from '@/components/auth/auth-error';
import { AdminEmpty, StatusBadge } from '@/components/admin/admin-ui';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { RatingStars } from '@/components/reviews/rating-stars';
import { humanise, reviewStatusTone } from '@/components/admin/status-tones';
import { toErrorMessage } from '@/services/api';
import { moderateReview } from '@/services/admin.service';
import { formatDate } from '@/lib/format';
import type { AdminReviewRow } from '@/types/admin';

/**
 * The moderation queue.
 *
 * Cards rather than a table, because the thing being judged is a paragraph of
 * prose — squeezing it into a column would truncate exactly the part a
 * moderator needs to read, and "expand row" is a click between them and the
 * decision.
 *
 * Approving is one click: it puts a review back in public view, and putting it
 * back out is equally one click. Rejecting asks first, because it removes
 * somebody's writing from the storefront and changes the product's rating.
 */
export function ReviewModeration({ reviews }: { reviews: AdminReviewRow[] }) {
  if (reviews.length === 0) {
    return (
      <AdminEmpty
        icon={Check}
        title="Nothing to moderate"
        body="Reviews appear here as customers write them. ZyCart approves on creation, because every review already comes from a delivered order."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li key={review.id}>
          <ReviewCard review={review} />
        </li>
      ))}
    </ul>
  );
}

function ReviewCard({ review }: { review: AdminReviewRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [rejecting, setRejecting] = useState(false);

  async function approve() {
    if (busy) return;

    setBusy(true);
    setError(undefined);

    try {
      await moderateReview(review.id, 'APPROVED');
      router.refresh();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border border-border bg-surface/40 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-background">
          {review.product.image && (
            <Image src={review.product.image} alt="" fill sizes="44px" className="object-cover" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-small font-medium">
            {review.product.slug ? (
              <Link
                href={`/products/${review.product.slug}`}
                target="_blank"
                rel="noreferrer"
                className="focus-ring rounded-sm hover:underline"
              >
                {review.product.name}
              </Link>
            ) : (
              review.product.name
            )}
          </p>

          <p className="text-caption text-muted-foreground">
            {review.author.id ? (
              <Link
                href={`/admin/customers/${review.author.id}`}
                className="focus-ring rounded-sm hover:underline"
              >
                {review.author.name}
              </Link>
            ) : (
              review.author.name
            )}
            {review.author.email && ` · ${review.author.email}`}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <RatingStars value={review.rating} label={`Rated ${review.rating} out of 5`} />
          <StatusBadge tone={reviewStatusTone(review.status)}>
            {humanise(review.status)}
          </StatusBadge>
        </div>
      </div>

      <div className="mt-3 sm:pl-14">
        {review.title && <p className="text-small font-semibold">{review.title}</p>}
        <p className="text-small mt-1 text-pretty whitespace-pre-line text-muted-foreground">
          {review.comment}
        </p>

        {review.images.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {review.images.map((src) => (
              <li key={src}>
                {/* Customer-supplied links; next/image would refuse an
                    unconfigured host, and a broken one must not break the card. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className="size-16 rounded-lg border border-border object-cover"
                />
              </li>
            ))}
          </ul>
        )}

        <p className="text-caption mt-2 flex flex-wrap items-center gap-x-2 text-muted-foreground">
          <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
          {review.edited && <span>· Edited</span>}
          {review.isVerifiedPurchase && (
            <span className="inline-flex items-center gap-1 text-success">
              <BadgeCheck className="size-3" aria-hidden />
              Verified purchase
            </span>
          )}
        </p>

        <AuthError message={error} />

        <div className="mt-3 flex flex-wrap gap-2">
          {review.status !== 'APPROVED' && (
            <Button size="sm" variant="brand" onClick={approve} disabled={busy}>
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" aria-hidden />
              ) : (
                <Check className="size-3.5" data-icon="inline-start" aria-hidden />
              )}
              Approve
            </Button>
          )}

          {review.status !== 'REJECTED' && (
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
              <X className="size-3.5" data-icon="inline-start" aria-hidden />
              Reject
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Reject this review?"
        destructive
        description={
          <>
            It will disappear from <strong>{review.product.name}</strong> and stop counting towards
            its rating, which will be recalculated. The customer keeps the review on their account
            and can edit it. You can approve it again at any time.
          </>
        }
        confirmLabel="Reject review"
        busyLabel="Rejecting…"
        onConfirm={async () => {
          await moderateReview(review.id, 'REJECTED');
          router.refresh();
        }}
      />
    </article>
  );
}
