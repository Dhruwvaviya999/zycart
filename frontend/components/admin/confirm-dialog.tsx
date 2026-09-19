'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AuthError } from '@/components/auth/auth-error';
import { toErrorMessage } from '@/services/api';

/**
 * Confirmation for an action that is hard to undo.
 *
 * Used for deleting a product, deactivating a customer, rejecting a review and
 * cancelling an order — and deliberately *not* for anything reversible, because
 * a dialog that appears for everything stops being read.
 *
 * The work happens here rather than in the caller, so the dialog can hold the
 * error: a failure leaves it open with an explanation instead of closing and
 * leaving the operator to wonder whether it worked.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busyLabel,
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm() {
    if (busy) return;

    setBusy(true);
    setError(undefined);

    try {
      await onConfirm();
      onOpenChange(false);
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) setError(undefined);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-h4">{title}</DialogTitle>
        <DialogDescription className="text-caption text-pretty text-muted-foreground">
          {description}
        </DialogDescription>

        <AuthError message={error} />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            size="cta"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            size="cta"
            variant={destructive ? 'destructive' : 'brand'}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
                {busyLabel ?? 'Working…'}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
