import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { formatPrice } from '@/lib/format';
import type { CartItem } from '@/types/cart';
import type { OrderPricing } from '@/types/order';

/**
 * What is being bought and what it costs.
 *
 * Shipping and tax are shown but not costed: there is no carrier or tax engine
 * yet, and naming them with an honest note is better than either hiding them or
 * inventing a number the customer would later be charged differently for.
 */
export function CheckoutSummaryPanel({
  items,
  pricing,
}: {
  items: CartItem[];
  pricing: OrderPricing;
}) {
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

      <Separator className="my-5" />

      <dl className="space-y-3">
        <Row label="Subtotal">{formatPrice(pricing.subtotal)}</Row>
        <Row label="Shipping">
          <span className="text-muted-foreground">Not yet calculated</span>
        </Row>
        <Row label="Taxes">
          <span className="text-muted-foreground">Not yet calculated</span>
        </Row>
        {pricing.discount > 0 && (
          <Row label="Discount" tone="success">
            −{formatPrice(pricing.discount)}
          </Row>
        )}
      </dl>

      <Separator className="my-5" />

      <div className="flex items-baseline justify-between">
        <span className="text-h4">Total</span>
        <span className="text-price-lg">{formatPrice(pricing.total)}</span>
      </div>

      <p className="text-caption mt-2 text-muted-foreground">
        Shipping and taxes will be calculated when those services are available. You will not be
        charged more than the total shown without confirming first.
      </p>
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
