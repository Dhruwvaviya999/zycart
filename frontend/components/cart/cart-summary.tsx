import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatPrice } from '@/lib/format';
import type { Cart } from '@/types/cart';

const FREE_SHIPPING_THRESHOLD = 999;

/**
 * Only the subtotal is a real number here.
 *
 * Shipping and tax are named but deliberately not costed: there is no shipping
 * or tax engine yet, and inventing a figure the customer would later be charged
 * differently for is worse than saying it is decided at checkout.
 */
export function CartSummary({ cart }: { cart: Cart }) {
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - cart.subtotal);
  const payable = cart.items.some((item) => item.product && item.availability !== 'out_of_stock');

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

        <Row label="Shipping">
          <span className="text-muted-foreground">Calculated at checkout</span>
        </Row>

        <Row label="Taxes">
          <span className="text-muted-foreground">Included where applicable</span>
        </Row>
      </dl>

      <Separator className="my-5" />

      <div className="flex items-baseline justify-between">
        <span className="text-h4">Total</span>
        <span className="text-price-lg">{formatPrice(cart.subtotal)}</span>
      </div>
      <p className="text-caption mt-1.5 text-muted-foreground">
        Before shipping, which is added at checkout.
      </p>

      {cart.subtotal > 0 && remaining > 0 && (
        <p className="text-caption mt-4 rounded-xl bg-brand-subtle px-3.5 py-2.5 font-medium text-brand">
          Add {formatPrice(remaining)} more to qualify for free shipping.
        </p>
      )}

      <Button size="cta-lg" variant="brand" className="mt-6 w-full" disabled={!payable}>
        <Lock className="size-4" data-icon="inline-start" />
        Proceed to checkout
        <ArrowRight className="size-4" data-icon="inline-end" />
      </Button>

      <p className="text-caption mt-3 text-center text-muted-foreground">
        Checkout opens in a later release.
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
