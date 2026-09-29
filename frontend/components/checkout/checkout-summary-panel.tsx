import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { PriceBreakdown } from '@/components/order/price-breakdown';
import { formatPrice } from '@/lib/format';
import type { CartItem } from '@/types/cart';
import type { ShippingPolicy } from '@/types/checkout';
import type { OrderPricing } from '@/types/order';

/**
 * What is being bought and what it costs.
 *
 * Until Phase 18 shipping and tax were named here but not costed, with a note
 * saying so. Both are real now, and so is the discount — every figure below is
 * the server's `priceOrder`, the same function that will price the order when
 * it is placed.
 *
 * The coupon field is passed in rather than built here, because applying a
 * code re-prices the whole summary and that state belongs to the checkout.
 */
export function CheckoutSummaryPanel({
  items,
  pricing,
  couponCode,
  shippingPolicy,
  children,
}: {
  items: CartItem[];
  pricing: OrderPricing;
  couponCode?: string | null;
  shippingPolicy: ShippingPolicy;
  /** The coupon field, between the lines and the money. */
  children?: React.ReactNode;
}) {
  // Measured on what is paid for the goods, as the server measures it.
  const goods = pricing.subtotal - pricing.discount;
  const toFreeDelivery = shippingPolicy.freeAbove - goods;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="text-h4">Order summary</h2>

      <ul className="mt-5 space-y-4">
        {items.map((item) => {
          const variant = [item.selectedColor, item.selectedSize].filter(Boolean).join(' · ');

          return (
            <li key={item.id} className="flex gap-3.5">
              <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-background">
                {item.product?.image && (
                  <Image
                    src={item.product.image}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                )}
                <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background tabular-nums">
                  {item.quantity}
                </span>
              </span>

              <span className="min-w-0 flex-1">
                <span className="text-small block truncate font-medium">
                  {item.product?.name ?? 'Product unavailable'}
                </span>
                <span className="text-caption block truncate text-muted-foreground">
                  {variant || item.product?.brand || ''}
                </span>
              </span>

              <span className="text-small shrink-0 font-medium tabular-nums">
                {formatPrice(item.lineTotal)}
              </span>
            </li>
          );
        })}
      </ul>

      {children && (
        <>
          <Separator className="my-5" />
          {children}
        </>
      )}

      <Separator className="my-5" />

      <PriceBreakdown pricing={pricing} couponCode={couponCode} size="lg" />

      {pricing.shipping > 0 && toFreeDelivery > 0 && (
        <p className="text-caption mt-4 rounded-xl bg-brand-subtle px-3.5 py-2.5 font-medium text-brand">
          Add {formatPrice(toFreeDelivery)} more for free delivery.
        </p>
      )}
    </div>
  );
}
