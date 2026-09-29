'use client';

import { useState } from 'react';
import { Loader2, TicketPercent, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPrice } from '@/lib/format';
import type { CheckoutCoupon } from '@/types/checkout';

/**
 * Applying a coupon at checkout.
 *
 * The field only collects a code. Whether it applies, and for how much, is
 * the server's answer — the checkout re-prices the whole summary with the code
 * and this component renders whatever came back: the discount it is worth, or
 * the sentence explaining why it is not. There is no client-side list of valid
 * codes and no arithmetic here, so nothing on the page can disagree with what
 * the order will be charged.
 */
export function CouponField({
  applied,
  error,
  busy,
  disabled,
  onApply,
  onRemove,
}: {
  applied: CheckoutCoupon | null;
  /** Why the last code tried does not apply, in the server's words. */
  error: string | null;
  busy: boolean;
  /** Once an order exists, its price — coupon included — is fixed. */
  disabled?: boolean;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const [code, setCode] = useState('');

  if (applied) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 px-3.5 py-3">
        <TicketPercent className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />

        <div className="min-w-0 flex-1">
          <p className="text-small font-semibold">
            {applied.code}{' '}
            <span className="font-medium text-success">−{formatPrice(applied.discount)}</span>
          </p>
          {applied.description && (
            <p className="text-caption mt-0.5 text-muted-foreground">{applied.description}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onRemove}
          disabled={busy || disabled}
          aria-label={`Remove coupon ${applied.code}`}
          className="focus-ring -m-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = code.trim();
        if (trimmed && !busy) onApply(trimmed);
      }}
      noValidate
    >
      <label htmlFor="coupon-code" className="text-small font-medium">
        Coupon code
      </label>

      <div className="mt-1.5 flex gap-2">
        <Input
          id="coupon-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="e.g. WELCOME10"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          disabled={busy || disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? 'coupon-code-message' : undefined}
          className="uppercase placeholder:normal-case"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={busy || disabled || code.trim().length === 0}
          className="shrink-0"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Apply'}
        </Button>
      </div>

      <p
        id="coupon-code-message"
        role={error ? 'alert' : undefined}
        className="text-caption min-h-4 pt-1.5 font-medium text-destructive"
      >
        {error ?? ''}
      </p>
    </form>
  );
}
