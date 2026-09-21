'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AuthError } from '@/components/auth/auth-error';
import { toErrorMessage } from '@/services/api';
import { deleteReview } from '@/services/review.service';

/**
 * Confirms deleting a review.
 *
 * Deletion is irreversible and a review can represent a genuine amount of
 * writing, so it asks once — and the confirming button is the destructive
 * variant while the safe option is the one focus lands on naturally.
 */
export function DeleteReviewDialog({
  open,
  onOpenChange,
  reviewId,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviewId: string | null;
  onDeleted: (reviewId: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm() {
    if (submitting || !reviewId) return;

    setSubmitting(true);
    setError(undefined);

    try {
      await deleteReview(reviewId);
      onDeleted(reviewId);
      onOpenChange(false);
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent size="sm">
        <DialogTitle className="text-h4">Delete review?</DialogTitle>
        <DialogDescription className="text-caption text-pretty text-muted-foreground">
          Your review will be removed from this product and the rating will be updated. This cannot
          be undone.
        </DialogDescription>

        <AuthError message={error} />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            size="cta"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button size="cta" variant="destructive" onClick={confirm} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
                Deleting…
              </>
            ) : (
              'Delete review'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
