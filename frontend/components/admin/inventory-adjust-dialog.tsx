'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AuthError } from '@/components/auth/auth-error';
import { StatusBadge } from '@/components/admin/admin-ui';
import { STOCK_LABEL, stockTone } from '@/components/admin/status-tones';
import { adjustStock } from '@/services/admin.service';
import { toErrorMessage } from '@/services/api';
import {
  ADJUSTMENT_REASONS,
  REASON_DIRECTION,
  REASON_LABEL,
  type AdjustmentReason,
  type AdjustmentResult,
  type StockState,
} from '@/types/admin';
import { cn } from '@/lib/utils';

/**
 * Changing stock, deliberately.
 *
 * ## What the operator types
 *
 * A **change**, not a total — `+20` or `−5`. The two modes below are both ways
 * of producing one: "Add or remove" takes the change directly, and "Set to
 * counted total" takes the number on the shelf and derives it. That second mode
 * sends the count as a precondition as well, so if stock moved while the
 * shelf was being counted the write fails loudly instead of applying a
 * difference that is no longer true.
 *
 * ## What the projection means
 *
 * The resulting stock updates as you type, and it is a **projection**. The
 * server applies the change to whatever the authoritative quantity turns out to
 * be, which is what makes two operators working at once safe. If the two
 * disagree, the success panel says so in words rather than quietly showing a
 * number nobody predicted.
 *
 * No optimistic update: this is inventory. The dialog waits for the server,
 * shows what actually happened, and only then refreshes the page behind it.
 */
export function InventoryAdjustDialog({
  open,
  onOpenChange,
  product,
  largeAdjustmentThreshold,
  onAdjusted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    name: string;
    sku: string;
    stock: number;
    stockState: StockState;
    lowStockThreshold: number;
    variant?: string;
  };
  /** Sent by the server, so the console and the API agree on "unusually large". */
  largeAdjustmentThreshold: number;
  /** Called once the change has been confirmed by the server. */
  onAdjusted?: (result: AdjustmentResult) => void;
}) {
  const router = useRouter();
  const fieldId = useId();

  const [mode, setMode] = useState<'change' | 'total'>('change');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<AdjustmentReason>('RESTOCK');
  const [note, setNote] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<AdjustmentResult>();

  /**
   * The typed number, or null when the field does not yet hold one.
   *
   * `Number('')` is 0 and `Number('-')` is NaN, and both would otherwise render
   * a confident projection for an input the operator is still halfway through.
   */
  const typed = parseAmount(amount);

  const quantityChange = typed === null ? null : mode === 'change' ? typed : typed - product.stock;

  const projected = quantityChange === null ? product.stock : product.stock + quantityChange;

  const large = quantityChange !== null && Math.abs(quantityChange) >= largeAdjustmentThreshold;

  /**
   * Reasons that fit the direction being typed.
   *
   * "Restock −5" is almost always a sign error and the server refuses it, so
   * the form does not offer it — but the server is still what enforces this.
   */
  const direction = quantityChange === null ? null : quantityChange > 0 ? 'increase' : 'decrease';

  const reasons = ADJUSTMENT_REASONS.filter(
    (candidate) => direction === null || REASON_DIRECTION[candidate] !== opposite(direction),
  );

  const reasonFits = reasons.includes(reason);

  /**
   * Keeps the reason usable as the sign changes.
   *
   * An operator who types `20`, then corrects it to `-20`, would otherwise be
   * left with "Restock" selected, a disabled button and an explanation to read.
   * Switching to the first reason that fits is what they were going to do next
   * anyway. Done on change rather than during render, so the choice is only
   * overridden by an edit the operator actually made.
   */
  function setAmountAndReason(next: string) {
    setAmount(next);

    const typedNext = parseAmount(next);
    const changeNext =
      typedNext === null || Number.isNaN(typedNext)
        ? null
        : mode === 'change'
          ? typedNext
          : typedNext - product.stock;

    if (changeNext === null || changeNext === 0) return;

    const wanted = changeNext > 0 ? 'increase' : 'decrease';
    if (REASON_DIRECTION[reason] === opposite(wanted)) {
      setReason(changeNext > 0 ? 'RESTOCK' : 'COUNT_CORRECTION');
    }
  }

  const problem = validate(quantityChange, projected, mode, typed);
  const ready = problem === null && reasonFits && !busy;

  function reset() {
    setMode('change');
    setAmount('');
    setReason('RESTOCK');
    setNote('');
    setError(undefined);
    setConfirming(false);
    setResult(undefined);
  }

  function close(next: boolean) {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function submit() {
    if (!ready || quantityChange === null) return;

    // An unusually large change asks once more before it applies. The step is
    // inside the same dialog rather than a second one, so Escape still cancels
    // the whole thing and focus never leaves.
    if (large && !confirming) {
      setConfirming(true);
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const adjusted = await adjustStock(product.id, {
        quantityChange,
        reason,
        ...(note.trim() ? { note: note.trim() } : {}),
        shownStock: product.stock,
        // Only the counted-total path sends a precondition. A plain change is
        // correct whatever the current quantity is, and blocking it on a stale
        // screen would fail work that was never wrong.
        ...(mode === 'total' ? { expectedStock: product.stock } : {}),
      });

      setResult(adjusted);
      onAdjusted?.(adjusted);
      router.refresh();
    } catch (cause) {
      setError(toErrorMessage(cause));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        {result ? (
          <AdjustmentDone result={result} onClose={() => close(false)} />
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <DialogTitle className="text-h4">Adjust stock</DialogTitle>
            <DialogDescription className="text-caption text-pretty text-muted-foreground">
              {product.name} · SKU {product.sku}
              {product.variant ? ` · ${product.variant}` : ''}
            </DialogDescription>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/50 px-4 py-3">
              <div>
                <p className="text-caption text-muted-foreground">Current stock</p>
                <p className="text-h4 tabular-nums">{product.stock}</p>
              </div>

              <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />

              <div className="text-right">
                <p className="text-caption text-muted-foreground">
                  {quantityChange === null ? 'Resulting stock' : 'Projected stock'}
                </p>
                <p
                  className={cn(
                    'text-h4 tabular-nums',
                    quantityChange === null && 'text-muted-foreground',
                    projected < 0 && 'text-destructive',
                  )}
                >
                  {/* The real arithmetic, even when it is impossible. Clamping
                      it to zero would print a number that looks legitimate
                      beside a message saying the result is not. */}
                  {projected < 0 ? `−${Math.abs(projected)}` : projected}
                </p>
              </div>
            </div>

            <ModeToggle
              mode={mode}
              onChange={(next) => {
                setMode(next);
                // The same digits mean the opposite thing in the other mode, so
                // the reason is reconciled against them again.
                setAmount('');
              }}
              disabled={busy}
            />

            <div className="mt-3 space-y-3">
              <label className="block" htmlFor={`${fieldId}-amount`}>
                <span className="text-caption font-medium">
                  {mode === 'change' ? 'Add or remove' : 'Counted total on the shelf'}
                </span>
                <Input
                  id={`${fieldId}-amount`}
                  value={amount}
                  onChange={(event) => setAmountAndReason(event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={mode === 'change' ? 'e.g. 20 or -5' : 'e.g. 17'}
                  aria-describedby={`${fieldId}-amount-hint`}
                  aria-invalid={problem !== null || undefined}
                  disabled={busy}
                  className="mt-1.5 tabular-nums"
                />
                <span
                  id={`${fieldId}-amount-hint`}
                  className={cn(
                    'text-caption mt-1 block text-pretty',
                    problem ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {problem ??
                    (mode === 'change'
                      ? 'A positive number adds stock, a negative number removes it.'
                      : 'What you counted. The change is worked out from the current stock.')}
                </span>
              </label>

              <label className="block" htmlFor={`${fieldId}-reason`}>
                <span className="text-caption font-medium">Reason</span>
                <select
                  id={`${fieldId}-reason`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value as AdjustmentReason)}
                  disabled={busy}
                  className="text-small focus-visible:ring-ring/50 mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-2.5 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px]"
                >
                  {reasons.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {REASON_LABEL[candidate]}
                    </option>
                  ))}
                </select>
                {!reasonFits && (
                  <span className="text-caption mt-1 block text-destructive">
                    {REASON_LABEL[reason]} does not fit a{' '}
                    {direction === 'increase' ? 'increase' : 'decrease'}. Choose another reason.
                  </span>
                )}
              </label>

              <label className="block" htmlFor={`${fieldId}-note`}>
                <span className="text-caption font-medium">
                  Note <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <Input
                  id={`${fieldId}-note`}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={300}
                  disabled={busy}
                  placeholder="Anything the next person should know"
                  className="mt-1.5"
                />
              </label>
            </div>

            <AuthError message={error} />

            {confirming && quantityChange !== null && (
              <p
                role="alert"
                className="text-small mt-3 flex items-start gap-2.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3.5 py-3 text-pretty"
              >
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
                <span>
                  This changes stock by{' '}
                  <strong className="tabular-nums">
                    {quantityChange > 0 ? '+' : '−'}
                    {Math.abs(quantityChange)}
                  </strong>{' '}
                  units, from {product.stock} to {projected}. That is a large correction — confirm
                  to apply it.
                </span>
              </p>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                size="cta"
                variant="outline"
                onClick={() => close(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" size="cta" variant="brand" disabled={!ready}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
                    Adjusting…
                  </>
                ) : confirming ? (
                  'Yes, adjust stock'
                ) : (
                  'Adjust stock'
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * What actually happened, in the server's numbers.
 *
 * Shown instead of closing silently, because the result can legitimately differ
 * from the projection — and an operator who was shown 34 and got 15 deserves a
 * sentence explaining why rather than a refreshed table.
 */
function AdjustmentDone({ result, onClose }: { result: AdjustmentResult; onClose: () => void }) {
  return (
    <>
      <DialogTitle className="text-h4">Stock adjusted</DialogTitle>
      <DialogDescription className="text-caption text-muted-foreground">
        {result.productName} · SKU {result.sku}
      </DialogDescription>

      <p className="text-h4 mt-4 tabular-nums">
        {result.quantityBefore} <span aria-hidden>→</span>
        <span className="sr-only">to</span> {result.quantityAfter}
        <span className="text-caption ml-2 font-normal text-muted-foreground">
          ({result.quantityChange > 0 ? '+' : '−'}
          {Math.abs(result.quantityChange)} units)
        </span>
      </p>

      <p className="mt-2">
        <StatusBadge tone={stockTone(result.stockState)}>
          {STOCK_LABEL[result.stockState]}
        </StatusBadge>
      </p>

      {result.stale && (
        <p className="text-caption mt-3 text-pretty text-muted-foreground">
          Stock had already moved to {result.quantityBefore} since this form was opened, so the
          change was applied to that. The units you asked for were still added or removed.
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <Button size="cta" variant="brand" onClick={onClose} autoFocus>
          Done
        </Button>
      </div>
    </>
  );
}

function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: 'change' | 'total';
  onChange: (mode: 'change' | 'total') => void;
  disabled: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="How to enter the adjustment"
      className="mt-4 inline-flex rounded-lg border border-border p-0.5"
    >
      {(
        [
          ['change', 'Add or remove'],
          ['total', 'Set to counted total'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          disabled={disabled}
          aria-pressed={mode === value}
          className={cn(
            'focus-ring text-caption rounded-md px-2.5 py-1 font-medium transition-colors',
            mode === value
              ? 'bg-brand-subtle text-brand'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** `-` and `+` alone are mid-typing, not zero. */
function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '+') return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** The message under the field, or null when the input is fine. */
function validate(
  quantityChange: number | null,
  projected: number,
  mode: 'change' | 'total',
  typed: number | null,
): string | null {
  if (typed !== null && Number.isNaN(typed)) return 'Enter a whole number of units.';
  if (quantityChange === null) return null;

  if (!Number.isInteger(quantityChange)) return 'Stock moves in whole units.';

  if (quantityChange === 0) {
    return mode === 'change'
      ? 'Enter how many units to add or remove.'
      : 'That is the current stock, so there is nothing to change.';
  }

  if (mode === 'total' && typed !== null && typed < 0) return 'A counted total cannot be negative.';
  if (projected < 0) return 'Stock cannot go below zero.';

  return null;
}

const opposite = (direction: 'increase' | 'decrease') =>
  direction === 'increase' ? 'decrease' : 'increase';
