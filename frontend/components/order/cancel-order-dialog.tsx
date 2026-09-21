'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthError } from '@/components/auth/auth-error';
import { toErrorMessage } from '@/services/api';
import { cancelOrder } from '@/services/order.service';
import { CANCELLATION_REASONS, type CancellationReason } from '@/types/order';
import { cn } from '@/lib/utils';

/**
 * Cancelling is destructive and irreversible, so it asks twice — the button
 * opens this, and a reason has to be chosen before it will go through.
 */
export function CancelOrderDialog({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancellationReason>();
  const [note, setNote] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    if (submitting) return;

    if (!reason) {
      setReasonError('Choose a reason so we know what went wrong');
      return;
    }

    setSubmitting(true);
    setError(undefined);

    try {
      await cancelOrder(orderNumber, reason, note);
      setOpen(false);
      // Re-renders the page from the server, so the status, timeline and any
      // restored stock are all read fresh.
      router.refresh();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button size="cta" variant="outline" onClick={() => setOpen(true)}>
        Cancel order
      </Button>

      <Dialog open={open} onOpenChange={(next) => !submitting && setOpen(next)}>
        <DialogContent
          showCloseButton={false}
          variant="sheet"
          size="md"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border p-5">
            <div className="min-w-0">
              <DialogTitle className="text-h4">Cancel this order?</DialogTitle>
              <DialogDescription className="text-caption mt-1 text-muted-foreground">
                {orderNumber} will be cancelled and the items returned to stock. This cannot be
                undone.
              </DialogDescription>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              aria-label="Close"
              className="focus-ring -mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <AuthError message={error} />

            <fieldset className={error ? 'pt-5' : undefined}>
              <legend className="text-small font-semibold">Why are you cancelling?</legend>

              <div className="mt-3 space-y-2">
                {CANCELLATION_REASONS.map((option) => (
                  <label
                    key={option}
                    className={cn(
                      'focus-within:ring-ring/45 text-small flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors focus-within:ring-[3px]',
                      reason === option
                        ? 'border-foreground bg-muted'
                        : 'border-border hover:border-foreground/25',
                    )}
                  >
                    <input
                      type="radio"
                      name="cancellation-reason"
                      value={option}
                      checked={reason === option}
                      onChange={() => {
                        setReason(option);
                        setReasonError(undefined);
                      }}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        'size-4 shrink-0 rounded-full border-2 transition-colors',
                        reason === option ? 'border-foreground bg-foreground' : 'border-border',
                      )}
                    />
                    {option}
                  </label>
                ))}
              </div>

              <p
                role={reasonError ? 'alert' : undefined}
                className="text-caption min-h-4 pt-2 font-medium text-destructive"
              >
                {reasonError ?? ''}
              </p>
            </fieldset>

            <div className="mt-2 space-y-2">
              <Label htmlFor="cancel-note" className="text-small font-medium">
                Anything else? (optional)
              </Label>
              <Input
                id="cancel-note"
                value={note}
                maxLength={300}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Tell us more"
                size="lg"
              />
            </div>
          </div>

          <div className="flex gap-3 border-t border-border p-4">
            <Button
              size="cta"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="flex-1"
            >
              Keep order
            </Button>
            <Button
              size="cta"
              variant="destructive"
              onClick={confirm}
              disabled={submitting}
              className="flex-1"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                  Cancelling...
                </>
              ) : (
                'Cancel order'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
