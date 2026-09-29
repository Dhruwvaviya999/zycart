import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE } from '@/lib/cart';
import { formatPrice } from '@/lib/format';
import type { Cart } from '@/types/cart';

/**
 * The bag's total, with delivery, before any coupon.
 *
 * Delivery is a real number from Phase 18, computed by the same rule the
 * server applies — free at or above the threshold, a flat fee below it — so
 * the figure here is the one checkout will show for the same basket. The one
 * thing that can change it is a coupon, which is applied at checkout and can
 * take a basket back below the free-delivery line; the caption says so rather
 * than the page pretending otherwise. GST is inside the prices, not added.
 */
export function CartSummary({ cart }: { cart: Cart }) {
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - cart.subtotal);
  const payable = cart.items.some((item) => item.product && item.availability !== 'out_of_stock');
  const delivery = cart.subtotal > 0 && remaining > 0 ? SHIPPING_FEE : 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-h4">Order summary</h2>

      <dl className="mt-5 space-y-3">
        <Row label={`Subtotal (${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'items'})`}>
          {formatPrice(cart.subtotal)}
        </Row>

        {cart.savings > 0 && (
          <Row label="You save" tone="success">
            −{formatPrice(cart.savings)}
          </Row>
        )}

        <Row label="Delivery">
          {cart.subtotal === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : delivery > 0 ? (
            formatPrice(delivery)
          ) : (
            <span className="font-medium text-success">Free</span>
          )}
        </Row>

        <Row label="GST">
          <span className="text-muted-foreground">Included in prices</span>
        </Row>
      </dl>

      <Separator className="my-5" />

      <div className="flex items-baseline justify-between">
        <span className="text-h4">Total</span>
        <span className="text-price-lg">{formatPrice(cart.subtotal + delivery)}</span>
      </div>
      <p className="text-caption mt-1.5 text-muted-foreground">
        Have a coupon? Apply it at checkout.
      </p>

      {cart.subtotal > 0 && remaining > 0 && (
        <p className="text-caption mt-4 rounded-xl bg-brand-subtle px-3.5 py-2.5 font-medium text-brand">
          Add {formatPrice(remaining)} more for free delivery.
        </p>
      )}

      {/* Disabled rather than hidden when nothing is payable, so the reason is
          visible right underneath instead of the button vanishing. */}
      <Button
        size="cta-lg"
        variant="brand"
        className="mt-6 w-full"
        disabled={!payable}
        render={payable ? <Link href="/checkout" /> : undefined}
      >
        <Lock className="size-4" data-icon="inline-start" />
        Proceed to checkout
        <ArrowRight className="size-4" data-icon="inline-end" />
      </Button>

      <p className="text-caption mt-3 text-center text-muted-foreground">
        {payable
          ? 'Cash on delivery. Nothing is charged until it arrives.'
          : 'Remove the unavailable items above to continue.'}
      </p>

      <Link
        href="/shop"
        className="focus-ring text-small mt-4 block rounded-md text-center font-medium text-foreground hover:text-brand"
      >
        Continue shopping
      </Link>
    </div>
  );
}

function Row({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: 'success';
  children: React.ReactNode;
}) {
  return (
    <div className="text-small flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={tone === 'success' ? 'font-medium text-success' : 'font-medium'}>
        {children}
      </dd>
    </div>
  );
}
