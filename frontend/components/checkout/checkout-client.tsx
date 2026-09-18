'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, Check, Loader2, MapPin, Plus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthError } from '@/components/auth/auth-error';
import { CheckoutSummaryPanel } from '@/components/checkout/checkout-summary-panel';
import { toErrorMessage } from '@/services/api';
import { createOrder } from '@/services/order.service';
import { useCartStore } from '@/store/cart-store';
import { formatPrice } from '@/lib/format';
import type { CheckoutSummary } from '@/types/checkout';
import { cn } from '@/lib/utils';

export function CheckoutClient({ summary }: { summary: CheckoutSummary }) {
  const router = useRouter();
  const refreshCart = useCartStore((state) => state.refresh);

  const [addressId, setAddressId] = useState(summary.selectedAddressId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [addressError, setAddressError] = useState<string>();

  const blocked = summary.issues.length > 0;
  const noAddress = summary.addresses.length === 0;

  async function placeOrder() {
    if (submitting) return;

    if (!addressId) {
      setAddressError('Choose where this order should be delivered');
      return;
    }

    setSubmitting(true);
    setError(undefined);
    setAddressError(undefined);

    try {
      const order = await createOrder(addressId);

      // The bought lines are gone from the server cart; bring the badge and the
      // cart page in step before leaving checkout.
      await refreshCart();

      router.replace(`/order-confirmation/${order.orderNumber}`);
    } catch (cause) {
      setError(toErrorMessage(cause));
      // The catalogue may have moved on — re-read so the issues list is current.
      router.refresh();
      setSubmitting(false);
    }
  }

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
              <fieldset className="mt-5">
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
            </>
          )}
        </section>

        <section aria-labelledby="payment-heading">
          <h2 id="payment-heading" className="text-h3">
            Payment
          </h2>

          {/* One method, presented as a choice rather than an assumption, so the
              customer sees what they are agreeing to. */}
          <div className="mt-5 flex gap-3 rounded-2xl border border-brand bg-brand-subtle/30 p-4">
            <span
              aria-hidden
              className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 border-brand bg-brand"
            >
              <Check className="size-2.5 text-brand-foreground" />
            </span>

            <div className="min-w-0">
              <p className="text-small flex items-center gap-2 font-semibold">
                <Wallet className="size-4" aria-hidden />
                Cash on delivery
              </p>
              <p className="text-caption mt-1 text-muted-foreground">
                Pay when your order arrives. Card and UPI payments are coming soon.
              </p>
            </div>
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-24">
        <CheckoutSummaryPanel items={summary.items} pricing={summary.pricing} />

        <div className="mt-4">
          <AuthError message={error} />
        </div>

        <Button
          size="cta-lg"
          variant="brand"
          onClick={placeOrder}
          disabled={submitting || blocked || noAddress}
          className="mt-4 w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              Placing your order...
            </>
          ) : (
            `Place order · ${formatPrice(summary.pricing.total)}`
          )}
        </Button>

        <p className="text-caption mt-3 text-center text-muted-foreground">
          You will pay {formatPrice(summary.pricing.total)} in cash when the order is delivered.
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
