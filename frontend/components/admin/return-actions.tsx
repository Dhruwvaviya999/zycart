'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Ban, Check, Loader2, Minus, PackageCheck, Plus, RefreshCw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { AuthError } from '@/components/auth/auth-error';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import {
  approveReturn,
  checkReturnRefund,
  receiveReturn,
  refundReturn,
  rejectReturn,
} from '@/services/admin.service';
import { toErrorMessage } from '@/services/api';
import { formatPrice } from '@/lib/format';
import type { AdminReturnDetail } from '@/types/admin';

/**
 * The decisions an operator can make about one return.
 *
 * ## Which buttons appear is the server's call
 *
 * `allowedStatuses` comes from the return's own transition graph, and
 * `refundPlan.refundable` from the same check the refund endpoint performs
 * before it moves any money. This component renders what those say and decides
 * nothing — so a "Refund" button is never shown for a cash-on-delivery order,
 * and the reason is rendered instead.
 *
 * ## Every decision opens a dialog, because every decision carries something
 *
 * Approving carries the quantities being agreed to — which default to what was
 * asked for, but which an operator may lower, releasing the difference back to
 * the customer's returnable pool. Rejecting carries a reason the customer will
 * read word for word. Receiving carries the judgement about whether goods are
 * resellable, which is the only control outside the inventory screen that
 * changes sellable stock. Refunding carries money leaving the account.
 *
 * None of those is a single click on a row, and each dialog states the
 * consequence before the button that causes it.
 */
export function ReturnActions({ request }: { request: AdminReturnDetail }) {
  const router = useRouter();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const [approving, setApproving] = useState(false);
  /**
   * The quantities being agreed to, seeded from what was asked for.
   *
   * A map so lowering one line does not disturb another, and defaulted to the
   * request rather than to zero — the overwhelmingly common decision is "yes,
   * all of it", and a form that made an operator re-enter the numbers to say so
   * is a form they would learn to rush.
   */
  const [approved, setApproved] = useState<Record<string, number>>(() =>
    Object.fromEntries(request.items.map((item) => [item.orderItemId, item.requestedQuantity])),
  );

  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [adminNote, setAdminNote] = useState('');

  const [receiving, setReceiving] = useState(false);
  const [resellable, setResellable] = useState(request.suggestResellable);

  const [refunding, setRefunding] = useState(false);

  const can = (status: string) => request.allowedStatuses.includes(status as never);

  async function run(key: string, action: () => Promise<unknown>) {
    if (busy) return;

    setBusy(key);
    setError(undefined);

    try {
      await action();
      // Re-reads the page from the server rather than patching state locally:
      // approving changes quantities, receiving may change stock, and refunding
      // changes the order. All of that should come back from the source.
      router.refresh();
    } catch (cause) {
      setError(toErrorMessage(cause));
      throw cause;
    } finally {
      setBusy(null);
    }
  }

  const refundable = request.refundPlan.refundable;
  const showRefund = request.status === 'RECEIVED';
  const showCheck = request.status === 'REFUND_PENDING';

  const nothingToDo = !can('APPROVED') && !can('REJECTED') && !can('RECEIVED') && !showRefund && !showCheck;

  return (
    <div className="rounded-xl border border-border bg-surface/40 p-5">
      <h2 className="text-small font-semibold">Decisions</h2>

      <AuthError message={error} />

      {/* A failed refund attempt is surfaced here rather than buried, because
          it is money the customer is owed and nothing else will chase it. */}
      {request.refundDetail.failureReason && request.status === 'RECEIVED' && (
        <div role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-caption font-semibold text-destructive">Last refund attempt failed</p>
          <p className="text-caption mt-1 text-pretty text-muted-foreground">
            {request.refundDetail.failureReason} Nothing was refunded — you can try again.
          </p>
        </div>
      )}

      {nothingToDo ? (
        <p className="text-caption mt-3 text-pretty text-muted-foreground">
          {request.status === 'REFUNDED'
            ? 'This return is complete. The refund has settled.'
            : request.status === 'REJECTED'
              ? 'This return was rejected. The customer has been given the reason.'
              : 'The customer withdrew this request. Nothing further to do.'}
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {can('APPROVED') && (
            <Button
              size="cta"
              variant="brand"
              onClick={() => setApproving(true)}
              disabled={busy !== null}
              className="w-full"
            >
              <Check className="size-4" data-icon="inline-start" aria-hidden />
              Approve return
            </Button>
          )}

          {can('RECEIVED') && (
            <Button
              size="cta"
              variant="brand"
              onClick={() => setReceiving(true)}
              disabled={busy !== null}
              className="w-full"
            >
              <PackageCheck className="size-4" data-icon="inline-start" aria-hidden />
              Mark goods received
            </Button>
          )}

          {showRefund &&
            (refundable ? (
              <Button
                size="cta"
                variant="brand"
                onClick={() => setRefunding(true)}
                disabled={busy !== null}
                className="w-full"
              >
                <Undo2 className="size-4" data-icon="inline-start" aria-hidden />
                Refund {formatPrice(request.refundPlan.amount)}
              </Button>
            ) : (
              // The explanation instead of a disabled button. A greyed-out
              // control tells an operator they cannot; this tells them why.
              <p className="text-caption rounded-lg border border-border bg-background p-3 text-pretty text-muted-foreground">
                {request.refundPlan.explanation}
              </p>
            ))}

          {showCheck && (
            <>
              <Button
                size="cta"
                variant="outline"
                onClick={() =>
                  void run('check', () => checkReturnRefund(request.returnNumber))
                }
                disabled={busy !== null}
                className="w-full"
              >
                {busy === 'check' ? (
                  <>
                    <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
                    Checking…
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-4" data-icon="inline-start" aria-hidden />
                    Check with Razorpay
                  </>
                )}
              </Button>
              {/* Said plainly, because an operator will look for a "mark as
                  refunded" button and should know why there isn't one. */}
              <p className="text-caption text-pretty text-muted-foreground">
                The refund is with the bank. There is no way to mark it settled by hand — this asks
                Razorpay and records whatever it says.
              </p>
            </>
          )}

          {can('REJECTED') && (
            <Button
              size="cta"
              variant="outline"
              onClick={() => setRejecting(true)}
              disabled={busy !== null}
              className="w-full"
            >
              <Ban className="size-4" data-icon="inline-start" aria-hidden />
              Reject return
            </Button>
          )}
        </div>
      )}

      {/* ---------------- Approve ---------------- */}

      <ConfirmDialog
        open={approving}
        onOpenChange={(open) => {
          if (!open) {
            setApproved(
              Object.fromEntries(
                request.items.map((item) => [item.orderItemId, item.requestedQuantity]),
              ),
            );
            setResolutionNote('');
          }
          setApproving(open);
        }}
        title="Approve this return?"
        description={
          <>
            <span className="block">
              The customer will be told to send these items back. Nothing moves in stock or in
              money until they arrive and you check them in.
            </span>

            <span className="mt-3 block space-y-2">
              {request.items.map((item) => {
                const quantity = approved[item.orderItemId] ?? item.requestedQuantity;

                return (
                  <span
                    key={item.orderItemId}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-caption block font-medium text-foreground">
                        {item.productName}
                      </span>
                      <span className="text-caption block text-muted-foreground">
                        Asked for {item.requestedQuantity} of {item.purchasedQuantity} bought
                      </span>
                    </span>

                    {/* Approving fewer releases the difference back to the
                        customer's returnable pool, which the server does in the
                        same transaction as the approval — so they can raise a
                        fresh request for the rest. */}
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setApproved((current) => ({
                            ...current,
                            [item.orderItemId]: Math.max(0, quantity - 1),
                          }))
                        }
                        disabled={quantity === 0}
                        aria-label={`Approve one fewer ${item.productName}`}
                        className="focus-ring grid size-7 place-items-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-40"
                      >
                        <Minus className="size-3" aria-hidden />
                      </button>

                      <span
                        aria-live="polite"
                        className="text-small w-5 text-center font-semibold tabular-nums"
                      >
                        {quantity}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setApproved((current) => ({
                            ...current,
                            [item.orderItemId]: Math.min(item.requestedQuantity, quantity + 1),
                          }))
                        }
                        disabled={quantity >= item.requestedQuantity}
                        aria-label={`Approve one more ${item.productName}`}
                        className="focus-ring grid size-7 place-items-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-40"
                      >
                        <Plus className="size-3" aria-hidden />
                      </button>
                    </span>
                  </span>
                );
              })}
            </span>

            {/* The server refuses an approval of nothing, so the operator is
                told here rather than discovering it by being refused. */}
            {Object.values(approved).every((quantity) => quantity === 0) && (
              <span role="alert" className="text-caption mt-2 block font-medium text-destructive">
                Approving zero units is a rejection. Use Reject instead, so the customer gets a
                reason.
              </span>
            )}

            <span className="mt-3 block">
              <label htmlFor="approve-note" className="text-caption font-medium text-foreground">
                Note for the customer{' '}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="approve-note"
                value={resolutionNote}
                onChange={(event) => setResolutionNote(event.target.value)}
                placeholder="Post them back with the original packaging."
                maxLength={500}
                className="mt-1.5"
              />
            </span>
          </>
        }
        confirmLabel="Approve return"
        busyLabel="Approving…"
        onConfirm={async () => {
          await run('approve', () =>
            approveReturn(request.returnNumber, {
              items: request.items.map((item) => ({
                orderItemId: item.orderItemId,
                approvedQuantity: approved[item.orderItemId] ?? item.requestedQuantity,
              })),
              ...(resolutionNote.trim() ? { resolutionNote: resolutionNote.trim() } : {}),
            }),
          );
          setResolutionNote('');
        }}
      />

      {/* ---------------- Reject ---------------- */}

      <ConfirmDialog
        open={rejecting}
        onOpenChange={(open) => {
          if (!open) {
            setRejectNote('');
            setAdminNote('');
          }
          setRejecting(open);
        }}
        title="Reject this return?"
        destructive
        description={
          <>
            <span className="block">
              <strong>{request.returnNumber}</strong> will be rejected and the items released so
              the customer can request them again if they need to.
            </span>

            <span className="mt-3 block">
              <label htmlFor="reject-reason" className="text-caption font-medium text-foreground">
                Reason for the customer <span className="text-destructive">*</span>
              </label>
              <span className="text-caption mt-0.5 block text-muted-foreground">
                They will read this word for word. A rejection with no explanation is refused by
                the server.
              </span>
              <Input
                id="reject-reason"
                value={rejectNote}
                onChange={(event) => setRejectNote(event.target.value)}
                placeholder="The items show clear signs of wear, so we cannot resell them."
                maxLength={500}
                className="mt-1.5"
              />
            </span>

            <span className="mt-3 block">
              <label htmlFor="reject-internal" className="text-caption font-medium text-foreground">
                Internal note <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <span className="text-caption mt-0.5 block text-muted-foreground">
                Staff only. Never shown to the customer.
              </span>
              <Input
                id="reject-internal"
                value={adminNote}
                onChange={(event) => setAdminNote(event.target.value)}
                maxLength={500}
                className="mt-1.5"
              />
            </span>
          </>
        }
        confirmLabel="Reject return"
        busyLabel="Rejecting…"
        onConfirm={async () => {
          await run('reject', () =>
            rejectReturn(request.returnNumber, rejectNote.trim(), adminNote),
          );
          setRejectNote('');
          setAdminNote('');
        }}
      />

      {/* ---------------- Receive ---------------- */}

      <ConfirmDialog
        open={receiving}
        onOpenChange={(open) => {
          if (!open) {
            setAdminNote('');
            setResellable(request.suggestResellable);
          }
          setReceiving(open);
        }}
        title="Mark these goods received?"
        description={
          <>
            <span className="block">
              Records that the items for <strong>{request.returnNumber}</strong> are physically
              back with us.
            </span>

            <span className="mt-3 block rounded-lg border border-border bg-background p-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <Checkbox
                  checked={resellable}
                  onCheckedChange={(checked) => setResellable(checked === true)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="text-caption block font-medium text-foreground">
                    These units can be sold again
                  </span>
                  {/* The consequence, stated before the click. This is the only
                      control in ZyCart outside the inventory screen that
                      changes sellable stock. */}
                  <span className="text-caption mt-0.5 block text-pretty text-muted-foreground">
                    {resellable
                      ? 'They go back into sellable stock, and a RETURN movement is written to the inventory ledger.'
                      : 'Stock is left untouched. Nothing is written to the ledger, because no sellable unit came back.'}
                  </span>
                </span>
              </label>
            </span>

            <span className="mt-3 block">
              <label htmlFor="receive-note" className="text-caption font-medium text-foreground">
                Internal note <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="receive-note"
                value={adminNote}
                onChange={(event) => setAdminNote(event.target.value)}
                placeholder="Box opened, tags intact"
                maxLength={500}
                className="mt-1.5"
              />
            </span>
          </>
        }
        confirmLabel="Mark received"
        busyLabel="Saving…"
        onConfirm={async () => {
          await run('receive', () =>
            receiveReturn(request.returnNumber, resellable, adminNote),
          );
          setAdminNote('');
        }}
      />

      {/* ---------------- Refund ---------------- */}

      <ConfirmDialog
        open={refunding}
        onOpenChange={setRefunding}
        title="Issue this refund?"
        description={
          <>
            <span className="block">
              <strong>{formatPrice(request.refundPlan.amount)}</strong> will be sent back to the
              customer’s original payment method through Razorpay. This cannot be undone.
            </span>
            {/* Where the number came from, so an operator can check it rather
                than trust it. */}
            <span className="text-caption mt-3 block text-pretty text-muted-foreground">
              The amount is worked out from the approved quantities at the prices on the original
              order, and capped at the {formatPrice(request.refundPlan.remainingOnOrder)} still
              refundable on it. There is no way to change it here.
            </span>
          </>
        }
        confirmLabel="Issue refund"
        busyLabel="Refunding…"
        onConfirm={() => run('refund', () => refundReturn(request.returnNumber))}
      />
    </div>
  );
}
