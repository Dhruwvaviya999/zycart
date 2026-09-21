'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, Loader2, MessageSquarePlus, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeleteReviewDialog } from '@/components/reviews/delete-review-dialog';
import { RatingSummary } from '@/components/reviews/rating-summary';
import { ReviewCard } from '@/components/reviews/review-card';
import { ReviewDialog } from '@/components/reviews/review-dialog';
import { ReviewSkeleton } from '@/components/reviews/review-skeleton';
import { toErrorMessage } from '@/services/api';
import {
  getProductReviews,
  getProductReviewSummary,
  getReviewEligibility,
} from '@/services/review.service';
import { useAuthStore } from '@/store/auth-store';
import type {
  OwnReview,
  RatingDistribution,
  RatingValue,
  Review,
  ReviewEligibility,
  ReviewSort,
} from '@/types/review';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

const SORTS: { value: ReviewSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'highest_rating', label: 'Highest' },
  { value: 'lowest_rating', label: 'Lowest' },
];

/** A signed-out visitor is not eligible by definition; no request is needed. */
const GUEST: ReviewEligibility = {
  eligible: false,
  reason: 'NOT_AUTHENTICATED',
  existingReview: null,
};

interface Summary {
  averageRating: number;
  reviewCount: number;
  distribution: RatingDistribution;
}

/** One page of results, tagged with the filter it answers. */
interface Loaded {
  key: string;
  items: Review[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * The review section on a product page.
 *
 * It owns the summary as state rather than rendering the prop it was given,
 * because writing, editing or deleting a review changes the average and the
 * distribution, and the customer should see that happen — not discover it on
 * the next full page load. The server remains the authority: every change
 * re-reads the list and the summary rather than guessing at the new numbers.
 */
export function ProductReviews({
  productId,
  productName,
  initialSummary,
}: {
  productId: string;
  productName: string;
  initialSummary: Summary;
}) {
  const authStatus = useAuthStore((state) => state.status);
  const authUser = useAuthStore((state) => state.user);

  const [summary, setSummary] = useState<Summary>(initialSummary);

  const [sort, setSort] = useState<ReviewSort>('newest');
  const [ratingFilter, setRatingFilter] = useState<RatingValue | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  /** Bumped to force a refetch of an otherwise unchanged filter. */
  const [reloadToken, setReloadToken] = useState(0);

  const filterKey = `${sort}|${ratingFilter ?? 'all'}|${verifiedOnly}|${reloadToken}`;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);

  /**
   * Loading is derived, not stored.
   *
   * "Am I waiting?" is exactly "do I hold results for the filter I am showing?",
   * so asking the question is more reliable than maintaining a boolean beside
   * it — the two can never disagree, and a request that resolves out of order
   * cannot leave a spinner running forever.
   */
  const answered = loaded?.key === filterKey || error?.key === filterKey;
  const loading = !answered;

  /**
   * Every result carries the filter it answers, which is what makes an older
   * request finishing after a newer one harmless: its key no longer matches, so
   * it is neither rendered nor allowed to overwrite the newer answer.
   */
  useEffect(() => {
    let cancelled = false;

    getProductReviews(productId, {
      page: 1,
      limit: PAGE_SIZE,
      sort,
      ...(ratingFilter ? { rating: ratingFilter } : {}),
      ...(verifiedOnly ? { verified: true } : {}),
    })
      .then((result) => {
        if (cancelled) return;

        setLoaded({
          key: filterKey,
          items: result.items,
          total: result.pagination.total,
          page: result.pagination.page,
          totalPages: result.pagination.totalPages,
        });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError({ key: filterKey, message: toErrorMessage(cause) });
      });

    return () => {
      cancelled = true;
    };
    // `filterKey` encodes every input to the request above.
  }, [productId, filterKey, sort, ratingFilter, verifiedOnly]);

  async function loadMore() {
    if (!loaded || loadingMore) return;

    setLoadingMore(true);

    try {
      const result = await getProductReviews(productId, {
        page: loaded.page + 1,
        limit: PAGE_SIZE,
        sort,
        ...(ratingFilter ? { rating: ratingFilter } : {}),
        ...(verifiedOnly ? { verified: true } : {}),
      });

      // A filter change while this was in flight moves the key on, and the
      // guard below then makes this append a no-op.
      setLoaded((current) =>
        current && current.key === filterKey
          ? {
              ...current,
              items: [...current.items, ...result.items],
              page: result.pagination.page,
              total: result.pagination.total,
              totalPages: result.pagination.totalPages,
            }
          : current,
      );
    } catch (cause) {
      setError({ key: filterKey, message: toErrorMessage(cause) });
    } finally {
      setLoadingMore(false);
    }
  }

  /**
   * Eligibility, derived where it can be and fetched where it cannot.
   *
   * A guest and an unresolved session both have an answer that needs no
   * request, so only a signed-in customer causes one — and the fetched value is
   * tagged with the product it describes, so it can never be shown against a
   * different one.
   */
  const [fetched, setFetched] = useState<{ productId: string; value: ReviewEligibility } | null>(
    null,
  );

  const eligibility: ReviewEligibility | null =
    authStatus !== 'ready'
      ? null
      : !authUser
        ? GUEST
        : fetched?.productId === productId
          ? fetched.value
          : null;

  useEffect(() => {
    if (authStatus !== 'ready' || !authUser) return;

    let cancelled = false;

    getReviewEligibility(productId)
      .then((value) => {
        if (!cancelled) setFetched({ productId, value });
      })
      .catch(() => {
        // A failed eligibility check is not worth an error banner: the section
        // simply does not offer to write a review, and the API would refuse one
        // anyway.
      });

    return () => {
      cancelled = true;
    };
  }, [authStatus, authUser, productId]);

  /** Re-reads the authoritative summary after any change. */
  const refreshSummary = useCallback(async () => {
    try {
      setSummary(await getProductReviewSummary(productId));
    } catch {
      // The list is still correct; a stale average corrects on next load.
    }
  }, [productId]);

  function reload() {
    setReloadToken((token) => token + 1);
  }

  async function afterWrite(saved: OwnReview) {
    setEditing(null);
    setWriteOpen(false);
    setFetched({
      productId,
      value: { eligible: false, reason: 'ALREADY_REVIEWED', existingReview: saved },
    });

    // Back to the first page of the default view, so the customer can see their
    // own review rather than wherever the current filter left them.
    setRatingFilter(null);
    setVerifiedOnly(false);
    setSort('newest');
    reload();

    await refreshSummary();
  }

  async function afterDelete() {
    setDeletingId(null);
    setFetched({
      productId,
      value: { eligible: true, reason: null, existingReview: null },
    });

    reload();
    await refreshSummary();
  }

  const [writeOpen, setWriteOpen] = useState(false);
  const [editing, setEditing] = useState<OwnReview | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const mine = eligibility?.existingReview ?? null;
  const filtered = ratingFilter !== null || verifiedOnly;

  const items = loaded?.key === filterKey ? loaded.items : [];
  const total = loaded?.key === filterKey ? loaded.total : summary.reviewCount;
  const hasMore = loaded?.key === filterKey && loaded.page < loaded.totalPages;
  const failure = error?.key === filterKey ? error.message : null;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-12">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <RatingSummary
          averageRating={summary.averageRating}
          reviewCount={summary.reviewCount}
          distribution={summary.distribution}
          activeRating={ratingFilter}
          onSelectRating={summary.reviewCount > 0 ? setRatingFilter : undefined}
        />

        <div className="mt-4">
          <ReviewCta
            eligibility={eligibility}
            productName={productName}
            onWrite={() => setWriteOpen(true)}
            onEdit={() => setEditing(mine)}
          />
        </div>
      </div>

      <div className="min-w-0">
        {summary.reviewCount > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border pb-4">
            <div
              role="group"
              aria-label="Sort reviews"
              className="flex flex-wrap items-center gap-1"
            >
              {SORTS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSort(option.value)}
                  aria-pressed={sort === option.value}
                  className={cn(
                    'focus-ring text-caption rounded-full px-3 py-1.5 font-medium transition-colors',
                    sort === option.value
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="focus-within:ring-ring/45 text-caption flex cursor-pointer items-center gap-2 rounded-full px-1 py-1 font-medium focus-within:ring-[3px]">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(event) => setVerifiedOnly(event.target.checked)}
                className="size-4 accent-brand"
              />
              Verified only
            </label>

            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setRatingFilter(null);
                  setVerifiedOnly(false);
                }}
                className="focus-ring text-caption ml-auto rounded-md font-medium text-brand hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Announced, so a filter change is not a silent visual-only update. */}
        <p aria-live="polite" className="sr-only">
          {loading
            ? 'Loading reviews'
            : `Showing ${items.length} of ${total} ${total === 1 ? 'review' : 'reviews'}`}
        </p>

        <div className="pt-6">
          {loading ? (
            <ReviewSkeleton />
          ) : failure ? (
            <div
              role="alert"
              className="flex gap-2.5 rounded-2xl border border-sale/30 bg-sale/5 p-5"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-sale" aria-hidden />
              <div className="min-w-0">
                <p className="text-small font-semibold text-sale">We could not load the reviews</p>
                <p className="text-caption mt-1 text-pretty text-muted-foreground">{failure}</p>
                <Button size="sm" variant="outline" onClick={reload} className="mt-4">
                  Try again
                </Button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <EmptyReviews
              filtered={filtered}
              onClear={() => {
                setRatingFilter(null);
                setVerifiedOnly(false);
              }}
            />
          ) : (
            <>
              <div>
                {items.map((review) => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    onEdit={mine ? () => setEditing(mine) : undefined}
                    onDelete={mine ? (target) => setDeletingId(target.id) : undefined}
                  />
                ))}
              </div>

              {hasMore && (
                <div className="mt-8 flex justify-center">
                  <Button
                    size="cta"
                    variant="outline"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2
                          className="size-4 animate-spin"
                          data-icon="inline-start"
                          aria-hidden
                        />
                        Loading…
                      </>
                    ) : (
                      `Load more reviews (${total - items.length} left)`
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ReviewDialog
        open={writeOpen || editing !== null}
        onOpenChange={(open) => {
          if (open) return;
          setWriteOpen(false);
          setEditing(null);
        }}
        productId={productId}
        productName={productName}
        existing={editing}
        onSaved={(saved) => void afterWrite(saved)}
      />

      <DeleteReviewDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
        reviewId={deletingId}
        onDeleted={() => void afterDelete()}
      />
    </div>
  );
}

/**
 * What to offer the reader, given what the server said about their eligibility.
 *
 * Every branch here is a different sentence, because "you cannot review this"
 * is unhelpful in all of them. A guest is asked to sign in, someone who has not
 * bought it is told what would make them eligible, someone waiting on delivery
 * is told to wait, and someone who has already written one is offered the edit
 * rather than a button that would fail.
 */
function ReviewCta({
  eligibility,
  productName,
  onWrite,
  onEdit,
}: {
  eligibility: ReviewEligibility | null;
  productName: string;
  onWrite: () => void;
  onEdit: () => void;
}) {
  // Still resolving, or the check failed: offer nothing rather than flicker.
  if (!eligibility) return null;

  if (eligibility.eligible) {
    return (
      <div className="rounded-2xl border border-border p-5">
        <p className="text-small font-semibold">You bought this</p>
        <p className="text-caption mt-1.5 mb-4 text-pretty text-muted-foreground">
          Share how it worked out. Your review will be marked as a verified purchase.
        </p>
        <Button size="cta" variant="brand" onClick={onWrite} className="w-full">
          <MessageSquarePlus className="size-4" data-icon="inline-start" aria-hidden />
          Write a review
        </Button>
      </div>
    );
  }

  if (eligibility.reason === 'ALREADY_REVIEWED' && eligibility.existingReview) {
    const pending = eligibility.existingReview.status === 'PENDING';
    const rejected = eligibility.existingReview.status === 'REJECTED';

    return (
      <div className="rounded-2xl border border-border p-5">
        <p className="text-small font-semibold">You&rsquo;ve reviewed this</p>
        <p className="text-caption mt-1.5 mb-4 text-pretty text-muted-foreground">
          {pending
            ? 'Your review is being checked and will appear here shortly.'
            : rejected
              ? 'Your review is not shown publicly. You can edit it and it will be looked at again.'
              : 'Thanks for sharing. You can change your review at any time.'}
        </p>
        <Button size="cta" variant="outline" onClick={onEdit} className="w-full">
          <PencilLine className="size-4" data-icon="inline-start" aria-hidden />
          Edit your review
        </Button>
      </div>
    );
  }

  if (eligibility.reason === 'NOT_AUTHENTICATED') {
    return (
      <div className="rounded-2xl border border-border p-5">
        <p className="text-small font-semibold">Bought this?</p>
        <p className="text-caption mt-1.5 mb-4 text-pretty text-muted-foreground">
          Sign in to leave a review. Only customers who have received the product can review it.
        </p>
        <Button size="cta" variant="outline" render={<Link href="/login" />} className="w-full">
          Sign in
        </Button>
      </div>
    );
  }

  if (eligibility.reason === 'ORDER_NOT_DELIVERED') {
    return (
      <div className="rounded-2xl border border-dashed border-border p-5">
        <p className="text-small font-semibold">Your order is on its way</p>
        <p className="text-caption mt-1.5 text-pretty text-muted-foreground">
          You can review {productName} once it has been delivered.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-border p-5">
      <p className="text-small font-semibold">Only buyers can review</p>
      <p className="text-caption mt-1.5 text-pretty text-muted-foreground">
        Purchase this product to leave a verified review. That is what keeps these ratings worth
        reading.
      </p>
    </div>
  );
}

function EmptyReviews({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  if (filtered) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-12 text-center">
        <p className="text-small font-semibold">No reviews match these filters</p>
        <p className="text-caption mt-1.5 text-muted-foreground">
          Try a different rating, or clear the filters to see everything.
        </p>
        <Button size="sm" variant="outline" onClick={onClear} className="mt-5">
          Clear filters
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-12 text-center">
      <p className="text-small font-semibold">No reviews yet</p>
      <p className="text-caption mt-1.5 text-pretty text-muted-foreground">
        Be the first to share your experience with this product.
      </p>
    </div>
  );
}
