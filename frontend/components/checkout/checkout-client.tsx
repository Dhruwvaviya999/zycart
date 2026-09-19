'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, Check, Loader2, Lock, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthError } from '@/components/auth/auth-error';
import { CheckoutSummaryPanel } from '@/components/checkout/checkout-summary-panel';
import { PaymentFailed, type PaymentFailureKind } from '@/components/payment/payment-failed';
import { PaymentMethodSelector } from '@/components/payment/payment-method-selector';
import { PaymentProcessing } from '@/components/payment/payment-processing';
import { useRazorpayPayment } from '@/hooks/use-razorpay-payment';
import { toErrorMessage } from '@/services/api';
import { createOrder } from '@/services/order.service';
import { useCartStore } from '@/store/cart-store';
import { formatPrice } from '@/lib/format';
import type { PaymentMethod } from '@/types/order';
import type { CheckoutSummary } from '@/types/checkout';
import { cn } from '@/lib/utils';

export function CheckoutClient({ summary }: { summary: CheckoutSummary }) {
  const router = useRouter();
  const refreshCart = useCartStore((state) => state.refresh);

  const [addressId, setAddressId] = useState(summary.selectedAddressId ?? '');
  const [method, setMethod] = useState<PaymentMethod>(
    summary.onlinePaymentAvailable ? 'RAZORPAY' : 'COD',
  );

  const [error, setError] = useState<string>();
  const [addressError, setAddressError] = useState<string>();

  /**
   * The order this checkout created, once it exists.
   *
   * Kept so that a retry after a failed payment pays for the *same* order
   * rather than placing a second one — which is also why the cart is not
   * cleared until the money is confirmed.
   */
  const [placedOrderId, setPlacedOrderId] = useState<string>();

  const payment = useRazorpayPayment();
  const [placing, setPlacing] = useState(false);

  const blocked = summary.issues.length > 0;
  const noAddress = summary.addresses.length === 0;

  /** One flag for "a submission is in flight", covering both payment methods. */
  const busy = placing || payment.busy;

  const total = summary.pricing.total;

  function requireAddress(): boolean {
    if (addressId) return true;
    setAddressError('Choose where this order should be delivered');
    return false;
  }

  /** Cash on delivery: the Phase 6 path, untouched. */
  async function placeCodOrder() {
    setPlacing(true);
    setError(undefined);

    try {
      const order = await createOrder(addressId, 'COD');
      await refreshCart();
      router.replace(`/order-confirmation/${order.orderNumber}`);
    } catch (cause) {
      setError(toErrorMessage(cause));
      // The catalogue may have moved on — re-read so the issues list is current.
      router.refresh();
      setPlacing(false);
    }
  }

  /**
   * Online payment: create the unpaid order, then pay for it.
   *
   * The order is created once and remembered. Everything after that point is a
   * payment attempt against it, so failing and trying again never produces a
   * second order.
   */
  async function payOnline() {
    let orderId = placedOrderId;

    if (!orderId) {
      setPlacing(true);
      setError(undefined);

      try {
        const order = await createOrder(addressId, 'RAZORPAY');
        orderId = order.id;
        setPlacedOrderId(order.id);
      } catch (cause) {
        setError(toErrorMessage(cause));
        router.refresh();
        setPlacing(false);
        return;
      } finally {
        setPlacing(false);
      }
    }

    const result = await payment.pay(orderId);

    if (result.kind === 'success') {
      // The bought lines are gone from the server cart; bring the badge and the
      // cart page in step before leaving checkout.
      await refreshCart();
      router.replace(`/order-confirmation/${result.order.orderNumber}`);
      return;
    }

    // Uncertain, but money may have moved — the confirmation page reads the
    // server's state and says so honestly, which is better than guessing here.
    if (result.kind === 'pending' || result.kind === 'unfulfillable') {
      await refreshCart();
      router.replace(`/order-confirmation/${result.order.orderNumber}`);
    }
  }

  async function submit() {
    if (busy) return;
    if (!requireAddress()) return;

    setAddressError(undefined);

    if (method === 'COD') {
      await placeCodOrder();
    } else {
      await payOnline();
    }
  }

  const failure: PaymentFailureKind | null =
    payment.attempt?.kind === 'cancelled'
      ? 'cancelled'
      : payment.attempt?.kind === 'failed'
        ? 'failed'
        : payment.attempt?.kind === 'unfulfillable'
          ? 'unfulfillable'
          : null;

  const cta =
    method === 'COD' ? `Place COD order · ${formatPrice(total)}` : `Pay ${formatPrice(total)}`;

  return (
    <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12">
      <div className="space-y-8">
        {/* Anything standing between the customer and the order, stated first. */}
        {blocked && (
          <div role="alert" className="rounded-2xl border border-sale/30 bg-sale/5 p-5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-sale" aria-hidden />
              <div className="min-w-0">
                <p className="text-small font-semibold text-sale">
                  Your cart needs a moment before you can order
                </p>
                <ul className="text-small mt-2 space-y-1 text-sale/90">
                  {summary.issues.map((issue) => (
                    <li key={issue.itemId}>
                      {issue.productName} {issue.message}.
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="outline" render={<Link href="/cart" />} className="mt-4">
                  Review cart
                </Button>
              </div>
            </div>
          </div>
        )}

        <section aria-labelledby="delivery-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="delivery-heading" className="text-h3">
              Delivery address
            </h2>
            <Button size="sm" variant="outline" render={<Link href="/account/addresses" />}>
              <Plus className="size-3.5" data-icon="inline-start" />
              {noAddress ? 'Add an address' : 'Manage addresses'}
            </Button>
          </div>

          {noAddress ? (
            <div className="mt-5 flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-10 text-center">
              <MapPin className="size-6 text-muted-foreground" aria-hidden />
              <p className="text-small mt-3 font-semibold">No saved addresses yet</p>
              <p className="text-caption mt-1.5 max-w-sm text-muted-foreground">
                Add where you would like this order delivered, then come back to finish checking
                out.
              </p>
              <Button
                size="cta"
                variant="brand"
                render={<Link href="/account/addresses" />}
                className="mt-5"
              >
                Add a delivery address
              </Button>
            </div>
          ) : (
            <>
              <fieldset className="mt-5" disabled={busy || Boolean(placedOrderId)}>
                <legend className="sr-only">Choose a delivery address</legend>

                <div className="grid gap-3 sm:grid-cols-2">
                  {summary.addresses.map((address) => {
                    const selected = addressId === address.id;

                    return (
                      <label
                        key={address.id}
                        className={cn(
                          'focus-within:ring-ring/45 relative flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors focus-within:ring-[3px]',
                          selected
                            ? 'border-brand bg-brand-subtle/30'
                            : 'border-border hover:border-foreground/25',
                        )}
                      >
                        <input
                          type="radio"
                          name="address"
                          value={address.id}
                          checked={selected}
                          onChange={() => {
                            setAddressId(address.id);
                            setAddressError(undefined);
                          }}
                          className="sr-only"
                        />

                        <span
                          aria-hidden
                          className={cn(
                            'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors',
                            selected ? 'border-brand bg-brand' : 'border-border',
                          )}
                        >
                          {selected && <Check className="size-2.5 text-brand-foreground" />}
                        </span>

                        <span className="min-w-0">
                          <span className="text-small flex items-center gap-2 font-semibold">
                            {address.label}
                            {address.isDefault && (
                              <span className="text-caption rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                                Default
                              </span>
                            )}
                          </span>
                          <span className="text-caption mt-1.5 block text-muted-foreground">
                            {address.fullName}
                            <br />
                            {address.addressLine1}
                            {address.addressLine2 ? `, ${address.addressLine2}` : ''}
                            <br />
                            {address.city}, {address.state} {address.postalCode}
                            <br />
                            {address.phone}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <p
                role={addressError ? 'alert' : undefined}
                className="text-caption min-h-4 pt-2 font-medium text-destructive"
              >
                {addressError ?? ''}
              </p>

              {placedOrderId && (
                <p className="text-caption text-muted-foreground">
                  Your order is reserved, so the delivery address is fixed for this attempt.
                </p>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="payment-heading">
          <h2 id="payment-heading" className="text-h3">
            Payment
          </h2>

          <PaymentMethodSelector
            value={method}
            onChange={(next) => {
              setMethod(next);
              setError(undefined);
              payment.reset();
            }}
            onlineAvailable={summary.onlinePaymentAvailable}
            // Once an online order exists, switching to cash would place a
            // second order for the same basket.
            disabled={busy || Boolean(placedOrderId)}
          />
        </section>
      </div>

      <aside className="lg:sticky lg:top-24">
        <CheckoutSummaryPanel items={summary.items} pricing={summary.pricing} />

        <div className="mt-4">
          <AuthError message={error} />
        </div>

        <PaymentProcessing phase={payment.phase} />

        {failure && (
          <PaymentFailed
            kind={failure}
            detail={payment.attempt?.kind === 'failed' ? payment.attempt.message : undefined}
            onRetry={failure === 'unfulfillable' ? undefined : submit}
            retrying={busy}
          />
        )}

        {payment.attempt?.kind === 'error' && (
          <div className="mt-4">
            <AuthError message={payment.attempt.message} />
          </div>
        )}

        <Button
          size="cta-lg"
          variant="brand"
          onClick={submit}
          disabled={busy || blocked || noAddress}
          className="mt-4 w-full"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
              {payment.phase === 'payment-open'
                ? 'Waiting for payment…'
                : payment.phase === 'verifying-payment' || payment.phase === 'confirming'
                  ? 'Confirming…'
                  : 'Just a moment…'}
            </>
          ) : failure ? (
            `Try again · ${formatPrice(total)}`
          ) : (
            cta
          )}
        </Button>

        <p className="text-caption mt-3 flex items-center justify-center gap-1.5 text-center text-muted-foreground">
          {method === 'COD' ? (
            `You will pay ${formatPrice(total)} in cash when the order is delivered.`
          ) : (
            <>
              <Lock className="size-3.5 shrink-0" aria-hidden />
              {formatPrice(total)} charged securely via Razorpay.
            </>
          )}
        </p>

        <Link
          href="/cart"
          className="focus-ring text-small mt-4 block rounded-md text-center font-medium text-foreground hover:text-brand"
        >
          Back to cart
        </Link>
      </aside>
    </div>
  );
}
