'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  InventoryAdjustDialog,
  type AdjustableVariant,
} from '@/components/admin/inventory-adjust-dialog';
import { setLowStockThreshold } from '@/services/admin.service';
import { toErrorMessage } from '@/services/api';
import type { StockState } from '@/types/admin';

/**
 * The button that opens the adjustment dialog.
 *
 * A separate component so the dialog's state lives with the one row that opened
 * it: a single dialog hoisted to the page would need the table to track which
 * product is selected, and every row would re-render when any row was clicked.
 *
 * The dialog is mounted only while open — there is no reason for twenty closed
 * dialogs to exist behind a page of twenty products.
 *
 * With a `target` (Phase 20) it adjusts that one colour and size, which is the
 * only way a product that tracks stock per variant can be adjusted at all.
 * Named `target` because `variant` was already the button's look.
 */
export function AdjustStockButton({
  product,
  target,
  largeAdjustmentThreshold,
  variant = 'outline',
  size = 'sm',
  label = 'Adjust',
  className,
}: {
  product: {
    id: string;
    name: string;
    sku: string;
    stock: number;
    stockState: StockState;
    lowStockThreshold: number;
  };
  /** The one stock variant to adjust, for a product that tracks stock per variant. */
  target?: AdjustableVariant;
  largeAdjustmentThreshold: number;
  variant?: 'outline' | 'brand';
  size?: 'sm' | 'cta';
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size={size}
        variant={variant}
        onClick={() => setOpen(true)}
        className={className}
        // The product name is in the accessible name because a page of rows
        // otherwise announces twenty buttons all called "Adjust" — and the
        // variant's, because a table of variants would announce one product
        // name twenty times.
        aria-label={
          target
            ? `Adjust stock for ${product.name}, ${target.label}`
            : `Adjust stock for ${product.name}`
        }
      >
        <SlidersHorizontal className="size-3.5" data-icon="inline-start" aria-hidden />
        {label}
      </Button>

      {open && (
        <InventoryAdjustDialog
          open={open}
          onOpenChange={setOpen}
          product={product}
          variant={target}
          largeAdjustmentThreshold={largeAdjustmentThreshold}
        />
      )}
    </>
  );
}

/**
 * The point at which this product starts warning.
 *
 * Not a stock change, so it writes no movement — it changes what the console
 * reports, not what the shop holds. Clearing it returns the product to the
 * store default rather than freezing today's default into the document, which
 * is why "Use store default" is a button rather than typing the number in.
 */
export function ThresholdControl({
  productId,
  threshold,
  usesDefault,
  storeDefault,
}: {
  productId: string;
  threshold: number;
  usesDefault: boolean;
  storeDefault: number;
}) {
  const router = useRouter();

  const [value, setValue] = useState(String(threshold));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const parsed = Number(value.trim());
  const valid = value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed <= 1000;
  const unchanged = usesDefault ? false : parsed === threshold;

  async function save(next: number | null) {
    if (busy) return;

    setBusy(true);
    setError(undefined);
    setSaved(false);

    try {
      const result = await setLowStockThreshold(productId, next);
      setValue(String(result.lowStockThreshold));
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void save(parsed);
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="min-w-0 flex-1" htmlFor="low-stock-threshold">
          <span className="text-caption font-medium">Warn at or below</span>
          <Input
            id="low-stock-threshold"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSaved(false);
            }}
            inputMode="numeric"
            autoComplete="off"
            disabled={busy}
            aria-invalid={!valid || undefined}
            aria-describedby="low-stock-threshold-hint"
            className="mt-1.5 tabular-nums"
          />
        </label>

        <Button type="submit" size="sm" variant="outline" disabled={!valid || unchanged || busy}>
          {busy ? (
            <>
              <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" aria-hidden />
              Saving…
            </>
          ) : (
            'Save'
          )}
        </Button>
      </form>

      <p
        id="low-stock-threshold-hint"
        className="text-caption mt-1.5 text-pretty"
        aria-live="polite"
      >
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : !valid ? (
          <span className="text-destructive">Enter a whole number between 0 and 1000.</span>
        ) : saved ? (
          <span className="text-success">Saved.</span>
        ) : usesDefault ? (
          <span className="text-muted-foreground">
            Following the store default of {storeDefault}.
          </span>
        ) : (
          <span className="text-muted-foreground">
            This product warns at its own threshold, not the store default of {storeDefault}.
          </span>
        )}
      </p>

      {!usesDefault && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void save(null)}
          disabled={busy}
          className="mt-1 -ml-2"
        >
          Use the store default
        </Button>
      )}
    </div>
  );
}
