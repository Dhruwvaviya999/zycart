'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { ArrowLeft, Check, Loader2, Minus, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/common/select-field';
import { AuthError } from '@/components/auth/auth-error';
import { toErrorMessage } from '@/services/api';
import { createReturn } from '@/services/return.service';
import { formatPrice } from '@/lib/format';
import {
  RETURN_REASON_OPTIONS,
  type ReturnReason,
  type Returnability,
} from '@/types/fulfillment';
import type { Order, OrderItem } from '@/types/order';
import { cn } from '@/lib/utils';

/**
 * Asking to send something back.
 *
 * ## Three steps, because the decision has three parts
 *
 * Pick the items, say why, then read back exactly what is being requested
 * before it is sent. The third step is the one that earns its keep: a return is
 * a commitment a customer makes about physical objects, and "are you sure?"
 * over a dialog they cannot see the contents of is not a confirmation, it is a
 * shrug. So the review step restates the products, the variants, the
 * quantities, the reasons and what happens next, in words.
 *
 * ## What the browser decides: nothing
 *
 * Eligibility, the return window and the returnable quantity per line all
 * arrive from the server in `returnability`. This component renders them and
 * bounds its own inputs by them so a customer cannot *ask* for something that
 * would be refused — but the asking is not the permission, and the server
 * checks every one of them again inside the transaction that writes the
 * request. If it refuses, the message is shown as-is and the customer's
 * selections are kept, because losing a half-filled form to a server error is
 * its own small insult.
 */
export function ReturnRequestDialog({
  order,
  returnability,
}: {
  order: Order;
  returnability: Returnability;
}) {
  const router = useRouter();
  const headingId = useId();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'items' | 'review' | 'done'>('items');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, ReturnReason>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ returnNumber: string } | null>(null);

  /** Only the lines the server says still have something returnable. */
  const returnable = returnability.lines.filter((line) => line.returnableQuantity > 0);

  const itemsById = new Map(order.items.map((item) => [item.id, item]));

  const selected = Object.entries(quantities).filter(([, quantity]) => quantity > 0);

  const estimatedRefund = selected.reduce((sum, [id, quantity]) => {
    const item = itemsById.get(id);
    return sum + (item ? item.unitPrice * quantity : 0);
  }, 0);

  function reset() {
    setStep('items');
    setQuantities({});
    setReasons({});
    setNote('');
    setError(undefined);
    setFieldError(undefined);
    setCreated(null);
  }

  function setQuantity(id: string, next: number, max: number) {
    setFieldError(undefined);
    setQuantities((current) => ({ ...current, [id]: Math.max(0, Math.min(max, next)) }));
  }

  function toReview() {
    if (selected.length === 0) {
      setFieldError('Choose at least one item to send back.');
      return;
    }

    const missing = selected.find(([id]) => !reasons[id]);

    if (missing) {
      const item = itemsById.get(missing[0]);
      setFieldError(`Tell us what went wrong with ${item?.productName ?? 'that item'}.`);
      return;
    }

    setFieldError(undefined);
    setError(undefined);
    setStep('review');
  }

  async function submit() {
    // Guards against a double submission from a fast second click or an Enter
    // key landing while the first request is still open.
    if (submitting) return;

    setSubmitting(true);
    setError(undefined);

    try {
      const request = await createReturn(order.orderNumber, {
        items: selected.map(([id, quantity]) => ({
          orderItemId: id,
          quantity,
          reason: reasons[id] as ReturnReason,
        })),
        ...(note.trim() ? { note: note.trim() } : {}),
      });

      setCreated({ returnNumber: request.returnNumber });
      setStep('done');

      // Re-renders the order from the server, so the returnable quantities and
      // the returns list on the page reflect what was just written.
      router.refresh();
    } catch (cause) {
      // Back to the form with everything still filled in. A 409 here is the
      // normal race — somebody claimed the last unit in another tab — and the
      // server's sentence explains it better than anything generic would.
      setError(toErrorMessage(cause));
      setStep('items');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button size="cta" variant="outline" onClick={() => setOpen(true)} className="w-full">
        Return an item
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (submitting) return;
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent
          aria-labelledby={headingId}
          showCloseButton={false}
          variant="sheet"
          size="lg"
        >
          <header className="flex items-start justify-between gap-3 border-b border-border p-5">
            <div className="min-w-0">
              <DialogTitle id={headingId} className="text-h4">
                {step === 'done' ? 'Return request submitted' : 'Return an item'}
              </DialogTitle>
              <DialogDescription className="text-caption mt-1 text-pretty text-muted-foreground">
                {step === 'items'
                  ? `From order ${order.orderNumber}. Choose what you want to send back.`
                  : step === 'review'
                    ? 'Check this over before you send it to us.'
                    : `We have your request for order ${order.orderNumber}.`}
              </DialogDescription>
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={submitting}
              aria-label="Close"
              className="focus-ring -mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <AuthError message={error} />

            {step === 'items' && (
              <div className={error ? 'pt-5' : undefined}>
                <ul className="space-y-3">
                  {returnable.map((line) => {
                    const item = itemsById.get(line.orderItemId);
                    if (!item) return null;

                    return (
                      <ItemPicker
                        key={line.orderItemId}
                        item={item}
                        max={line.returnableQuantity}
                        quantity={quantities[line.orderItemId] ?? 0}
                        reason={reasons[line.orderItemId]}
                        onQuantity={(next) => setQuantity(line.orderItemId, next, line.returnableQuantity)}
                        onReason={(next) => {
                          setFieldError(undefined);
                          setReasons((current) => ({ ...current, [line.orderItemId]: next }));
                          // Choosing a reason for an unselected line is a clear
                          // intent to return one of it; honouring that saves a
                          // click and cannot select more than is available.
                          setQuantities((current) =>
                            current[line.orderItemId]
                              ? current
                              : { ...current, [line.orderItemId]: 1 },
                          );
                        }}
                      />
                    );
                  })}
                </ul>

                <div className="mt-5 space-y-2">
                  <Label htmlFor="return-note" className="text-small font-medium">
                    Anything else we should know?{' '}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="return-note"
                    value={note}
                    maxLength={500}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Tell us more"
                    size="lg"
                  />
                </div>

                <p
                  role={fieldError ? 'alert' : undefined}
                  className="text-caption min-h-4 pt-2 font-medium text-destructive"
                >
                  {fieldError ?? ''}
                </p>
              </div>
            )}

            {step === 'review' && (
              <Review
                items={selected.map(([id, quantity]) => ({
                  item: itemsById.get(id) as OrderItem,
                  quantity,
                  reason: reasons[id] as ReturnReason,
                }))}
                note={note}
                estimatedRefund={estimatedRefund}
              />
            )}

            {step === 'done' && created && (
              <Success returnNumber={created.returnNumber} orderNumber={order.orderNumber} />
            )}
          </div>

          <footer className="flex gap-3 border-t border-border p-4">
            {step === 'items' && (
              <>
                <Button
                  size="cta"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button size="cta" variant="brand" onClick={toReview} className="flex-1">
                  Review
                </Button>
              </>
            )}

            {step === 'review' && (
              <>
                <Button
                  size="cta"
                  variant="outline"
                  onClick={() => setStep('items')}
                  disabled={submitting}
                  className="flex-1"
                >
                  <ArrowLeft className="size-4" data-icon="inline-start" aria-hidden />
                  Back
                </Button>
                <Button
                  size="cta"
                  variant="brand"
                  onClick={submit}
                  disabled={submitting}
                  className="flex-1"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
                      Sending…
                    </>
                  ) : (
                    'Submit request'
                  )}
                </Button>
              </>
            )}

            {step === 'done' && created && (
              <>
                <Button
                  size="cta"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  className="flex-1"
                >
                  Back to order
                </Button>
                <Button
                  size="cta"
                  variant="brand"
                  className="flex-1"
                  render={<Link href={`/account/returns/${created.returnNumber}`} />}
                >
                  View request
                </Button>
              </>
            )}
          </footer>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------------------------------------------------------- */

function ItemPicker({
  item,
  max,
  quantity,
  reason,
  onQuantity,
  onReason,
}: {
  item: OrderItem;
  max: number;
  quantity: number;
  reason?: ReturnReason;
  onQuantity: (next: number) => void;
  onReason: (next: ReturnReason) => void;
}) {
  const variant = [item.selectedColor, item.selectedSize].filter(Boolean).join(' · ');
  const chosen = quantity > 0;
  const reasonId = useId();

  return (
    <li
      className={cn(
        'rounded-2xl border p-4 transition-colors',
        chosen ? 'border-foreground/30 bg-muted/40' : 'border-border',
      )}
    >
      <div className="flex gap-3">
        <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface">
          {item.productImage && (
            <Image src={item.productImage} alt="" fill sizes="56px" className="object-cover" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-small font-medium">{item.productName}</p>
          <p className="text-caption mt-0.5 text-muted-foreground">
            {variant ? `${variant} · ` : ''}
            {formatPrice(item.unitPrice)}
          </p>
          <p className="text-caption mt-0.5 text-muted-foreground">
            {/* Says what is available rather than only enforcing it, so the
                stepper stopping at 1 of 2 is explained rather than puzzling. */}
            {max === item.quantity
              ? `${max} bought`
              : `${max} of ${item.quantity} can still be returned`}
          </p>
        </div>

        {/* A stepper rather than a number input: it cannot be typed out of
            range, and it is a far larger target on a phone. */}
        <div className="flex shrink-0 items-center gap-1 self-start">
          <button
            type="button"
            onClick={() => onQuantity(quantity - 1)}
            disabled={quantity === 0}
            aria-label={`Return one fewer ${item.productName}`}
            className="focus-ring grid size-8 place-items-center rounded-lg border border-border transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Minus className="size-3.5" aria-hidden />
          </button>

          <span
            aria-live="polite"
            className="text-small w-6 text-center font-semibold tabular-nums"
          >
            {quantity}
          </span>

          <button
            type="button"
            onClick={() => onQuantity(quantity + 1)}
            disabled={quantity >= max}
            aria-label={`Return one more ${item.productName}`}
            className="focus-ring grid size-8 place-items-center rounded-lg border border-border transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {chosen && (
        <div className="mt-4">
          <label htmlFor={reasonId} className="text-caption font-medium">
            What went wrong?
          </label>
          <SelectField
            id={reasonId}
            value={reason ?? ''}
            onValueChange={(next) => onReason(next as ReturnReason)}
            options={RETURN_REASON_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            placeholder="Choose a reason"
            size="lg"
            className="mt-1.5"
          />

          {reason && (
            <p className="text-caption mt-1.5 text-pretty text-muted-foreground">
              {RETURN_REASON_OPTIONS.find((option) => option.value === reason)?.hint}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The read-back before submission.
 *
 * Deliberately restates everything rather than summarising it. "2 items" tells
 * a customer nothing they can check; "Nike Air Max, size 9, 1 — size doesn't
 * fit" is a sentence they can either agree with or correct.
 */
function Review({
  items,
  note,
  estimatedRefund,
}: {
  items: { item: OrderItem; quantity: number; reason: ReturnReason }[];
  note: string;
  estimatedRefund: number;
}) {
  return (
    <div>
      <p className="text-small font-semibold">You are asking to return:</p>

      <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
        {items.map(({ item, quantity, reason }) => {
          const variant = [item.selectedColor, item.selectedSize].filter(Boolean).join(' · ');

          return (
            <li key={item.id} className="flex gap-3 p-4">
              <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-surface">
                {item.productImage && (
                  <Image src={item.productImage} alt="" fill sizes="48px" className="object-cover" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-small font-medium">{item.productName}</p>
                {variant && <p className="text-caption text-muted-foreground">{variant}</p>}
                <p className="text-caption mt-1 text-muted-foreground">
                  Quantity: <span className="font-medium text-foreground">{quantity}</span>
                </p>
                <p className="text-caption text-muted-foreground">
                  Reason:{' '}
                  <span className="font-medium text-foreground">
                    {RETURN_REASON_OPTIONS.find((option) => option.value === reason)?.label}
                  </span>
                </p>
              </div>

              <p className="text-small shrink-0 font-medium tabular-nums">
                {formatPrice(item.unitPrice * quantity)}
              </p>
            </li>
          );
        })}
      </ul>

      {note.trim() && (
        <div className="mt-4 rounded-2xl border border-border p-4">
          <p className="text-caption font-medium text-muted-foreground">Your note</p>
          <p className="text-small mt-1 text-pretty">{note.trim()}</p>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <div className="text-small flex items-baseline justify-between gap-4">
          <span className="text-muted-foreground">Value of these items</span>
          <span className="font-semibold tabular-nums">{formatPrice(estimatedRefund)}</span>
        </div>
        {/* Careful wording. This is what the items were worth, not a promise of
            what will be refunded — the amount is the server's to decide, after
            an operator agrees the quantities. */}
        <p className="text-caption mt-2 text-pretty text-muted-foreground">
          This is what these items cost on your order. Any refund is confirmed after we review your
          request and receive the items back.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-brand/30 bg-brand-subtle/20 p-4">
        <p className="text-small font-semibold">What happens next</p>
        <ol className="text-caption mt-2 space-y-1.5 text-pretty text-muted-foreground">
          <li>1. Our team reviews your request — usually within a working day.</li>
          <li>2. If it is approved, we will tell you how to send the items back.</li>
          <li>3. Once they arrive and are checked, any refund goes to your original payment method.</li>
        </ol>
      </div>
    </div>
  );
}

function Success({ returnNumber, orderNumber }: { returnNumber: string; orderNumber: string }) {
  return (
    <div className="text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-success/12 text-success">
        <Check className="size-6" aria-hidden />
      </span>

      <p className="text-h4 mt-4">Return request submitted</p>

      <p className="text-small mt-2 text-muted-foreground">
        Request <span className="font-semibold text-foreground">{returnNumber}</span>
      </p>
      <p className="text-caption mt-1 text-muted-foreground">
        Status: <span className="font-medium text-foreground">Under review</span>
      </p>

      {/* No promise of an email: ZyCart does not send any yet, and telling a
          customer to watch their inbox for something that will never arrive is
          worse than telling them where to look. */}
      <p className="text-caption mx-auto mt-4 max-w-sm text-pretty text-muted-foreground">
        Follow it any time under Returns in your account, or from order {orderNumber}. We usually
        review requests within a working day.
      </p>
    </div>
  );
}
