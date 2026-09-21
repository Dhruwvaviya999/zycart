'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AuthError } from '@/components/auth/auth-error';
import { bulkUpdateOrderStatus } from '@/services/admin.service';
import { toErrorMessage } from '@/services/api';
import type { BulkResult } from '@/types/admin';

/**
 * Selecting orders and moving them together.
 *
 * ## Why it is built this way
 *
 * The orders table stays a **server component**. Only the checkboxes and the
 * action bar are client code, and they share state through this context — so
 * selecting a row does not force the table, its images and its formatting back
 * into the browser bundle.
 *
 * ## What it will and will not do
 *
 * Forward moves only. There is no bulk cancel here and none on the server
 * either: cancelling restores stock and may owe a refund, and a decision with
 * those consequences does not belong behind a checkbox column.
 *
 * Nothing is filtered out of the selection for being ineligible. The server
 * owns the transition rules and applies them per order — so the dialog reports
 * what moved and what did not, rather than this component guessing and being
 * wrong in either direction.
 */
interface SelectionValue {
  selectable: string[];
  selected: Set<string>;
  toggle: (orderNumber: string) => void;
  toggleAll: () => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionValue | null>(null);

function useSelection(): SelectionValue {
  const value = useContext(SelectionContext);
  if (!value) throw new Error('Order selection used outside its provider');
  return value;
}

export function OrderSelectionProvider({
  selectable,
  children,
}: {
  selectable: string[];
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((orderNumber: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(orderNumber)) next.add(orderNumber);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((current) =>
      current.size === selectable.length ? new Set() : new Set(selectable),
    );
  }, [selectable]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const value = useMemo(
    () => ({ selectable, selected, toggle, toggleAll, clear }),
    [selectable, selected, toggle, toggleAll, clear],
  );

  return <SelectionContext value={value}>{children}</SelectionContext>;
}

export function OrderSelectCheckbox({ orderNumber }: { orderNumber: string }) {
  const { selected, toggle } = useSelection();

  return (
    <Checkbox
      checked={selected.has(orderNumber)}
      onCheckedChange={() => toggle(orderNumber)}
      aria-label={`Select order ${orderNumber}`}
    />
  );
}

export function OrderSelectAllCheckbox() {
  const { selectable, selected, toggleAll } = useSelection();

  const all = selectable.length > 0 && selected.size === selectable.length;

  return (
    <Checkbox
      checked={all}
      indeterminate={selected.size > 0 && !all}
      onCheckedChange={toggleAll}
      aria-label={all ? 'Clear selection' : 'Select every order on this page'}
    />
  );
}

const MOVES = [
  { status: 'CONFIRMED', label: 'Confirm' },
  { status: 'PROCESSING', label: 'Mark as processing' },
  { status: 'SHIPPED', label: 'Mark as shipped' },
  { status: 'DELIVERED', label: 'Mark as delivered' },
] as const;

type BulkStatus = (typeof MOVES)[number]['status'];

/**
 * The action bar, which appears only once something is selected.
 *
 * Sticky to the bottom of the viewport rather than pinned above the table: an
 * operator selecting rows is scrolled down among them, and a bar at the top
 * would be off screen exactly when it became relevant.
 */
export function OrderBulkBar() {
  const router = useRouter();
  const { selected, clear } = useSelection();

  const [pending, setPending] = useState<BulkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<BulkResult | null>(null);

  const count = selected.size;
  if (count === 0 && result === null) return null;

  async function run() {
    if (!pending || busy) return;

    setBusy(true);
    setError(undefined);

    try {
      const outcome = await bulkUpdateOrderStatus([...selected], pending);

      setResult(outcome);
      setPending(null);
      clear();
      router.refresh();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const move = MOVES.find((entry) => entry.status === pending);

  return (
    <>
      {count > 0 && (
        <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-small font-medium" aria-live="polite">
              {count} {count === 1 ? 'order' : 'orders'} selected
            </p>

            <div className="ml-auto flex flex-wrap gap-2">
              {MOVES.map((entry) => (
                <Button
                  key={entry.status}
                  size="sm"
                  variant="outline"
                  onClick={() => setPending(entry.status)}
                >
                  {entry.label}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={clear}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation. Says what will happen and to how many, before anything
          runs — never a bare "Are you sure?". */}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (busy) return;
          if (!open) {
            setPending(null);
            setError(undefined);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="text-h4">
            {move?.label} {count} orders?
          </DialogTitle>
          <DialogDescription className="text-caption text-pretty text-muted-foreground">
            Each order is moved on its own and follows the same rules as changing one by hand. Any
            order that cannot make this move — because it has already shipped, or was cancelled — is
            left exactly as it is, and listed afterwards.
          </DialogDescription>

          <AuthError message={error} />

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="cta" variant="outline" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button size="cta" variant="brand" onClick={() => void run()} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
                  Updating {count} orders…
                </>
              ) : (
                `${move?.label} ${count} orders`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BulkResultDialog result={result} onClose={() => setResult(null)} />
    </>
  );
}

/**
 * What actually happened, per order.
 *
 * "Success" would be a lie whenever one order in twenty could not move, and a
 * silent partial failure is how an operator ends up believing a shipment went
 * out. The failures are listed with the server's own explanation — the same
 * sentence the single-order action would have shown.
 */
function BulkResultDialog({ result, onClose }: { result: BulkResult | null; onClose: () => void }) {
  return (
    <Dialog open={result !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {result && (
          <>
            <DialogTitle className="text-h4">
              {result.failed === 0 ? 'All orders updated' : 'Some orders were not updated'}
            </DialogTitle>
            <DialogDescription className="text-caption text-muted-foreground">
              {result.requested} {result.requested === 1 ? 'order' : 'orders'} selected
            </DialogDescription>

            <div className="mt-4 flex flex-wrap gap-4">
              <p className="text-small inline-flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" aria-hidden />
                <span className="tabular-nums">{result.succeeded}</span> updated
              </p>
              {result.failed > 0 && (
                <p className="text-small inline-flex items-center gap-2">
                  <XCircle className="size-4 text-destructive" aria-hidden />
                  <span className="tabular-nums">{result.failed}</span> unchanged
                </p>
              )}
            </div>

            {result.failed > 0 && (
              <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto border-t border-border pt-4">
                {result.outcomes
                  .filter((outcome) => !outcome.ok)
                  .map((outcome) => (
                    <li key={outcome.orderNumber}>
                      <p className="text-small font-medium">{outcome.orderNumber}</p>
                      <p className="text-caption text-pretty text-muted-foreground">
                        {outcome.message}
                      </p>
                    </li>
                  ))}
              </ul>
            )}

            <div className="mt-5 flex justify-end">
              <Button size="cta" variant="brand" onClick={onClose} autoFocus>
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
