'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MessageSquarePlus, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RatingStars } from '@/components/reviews/rating-stars';
import { ReviewDialog } from '@/components/reviews/review-dialog';
import { getReviewEligibility } from '@/services/review.service';
import type { OwnReview, ReviewEligibility } from '@/types/review';

/**
 * The review affordance on a delivered order's line.
 *
 * This is where reviewing is most likely to occur to somebody — they are
 * looking at the thing they received — so the invitation belongs here rather
 * than only on the product page, where they would have to go looking for it.
 *
 * It is rendered only for delivered orders, and it asks the server whether this
 * customer may review before offering anything. The button never appears
 * speculatively, so it never leads to a refusal.
 */
export function OrderItemReview({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const router = useRouter();

  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getReviewEligibility(productId)
      .then((result) => {
        if (!cancelled) setEligibility(result);
      })
      .catch(() => {
        // Silently render nothing: an unavailable eligibility check is not
        // something to put an error message on an order page about.
        if (!cancelled) setEligibility(null);
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!eligibility) return null;

  const existing = eligibility.existingReview;

  // Neither eligible nor already reviewed — the product was replaced, or
  // something else changed. Nothing useful to offer.
  if (!eligibility.eligible && !existing) return null;

  function saved(review: OwnReview) {
    setEligibility({ eligible: false, reason: 'ALREADY_REVIEWED', existingReview: review });
    // Re-render from the server so anything else keyed on this review is fresh.
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {existing ? (
        <>
          <RatingStars
            value={existing.rating}
            label={`You rated this ${existing.rating} out of 5`}
          />
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <PencilLine className="size-3.5" data-icon="inline-start" aria-hidden />
            Edit review
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <MessageSquarePlus className="size-3.5" data-icon="inline-start" aria-hidden />
          Write a review
        </Button>
      )}

      <ReviewDialog
        open={open}
        onOpenChange={setOpen}
        productId={productId}
        productName={productName}
        existing={existing}
        onSaved={saved}
      />
    </div>
  );
}
