import { Separator } from '@/components/ui/separator';
import { formatExactPrice, formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { OrderPricing } from '@/types/order';

/**
 * The money on a checkout or an order, laid out the same way everywhere.
 *
 * Checkout, the customer's order page and the admin's order page all print
 * these rows, and Phase 18 gave each of them three new facts to get right at
 * once — a coupon, a delivery charge and GST contained in the price. One
 * component means one place where "the total already includes GST" is said,
 * rather than three places that could each say it slightly differently.
 *
 * It does no arithmetic. Every figure is the server's; the component decides
 * only how to word them.
 */
export function PriceBreakdown({
  pricing,
  couponCode,
  size = 'md',
  className,
}: {
  pricing: OrderPricing;
  /** Names the discount row when a coupon produced it. */
  couponCode?: string | null;
  /** `lg` for checkout, where the total is the page's headline. */
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <div className={className}>
      <dl className="space-y-2.5">
        <Row label="Subtotal">{formatPrice(pricing.subtotal)}</Row>

        {pricing.discount > 0 && (
          <Row label={couponCode ? `Coupon ${couponCode}` : 'Discount'} tone="success">
            −{formatPrice(pricing.discount)}
          </Row>
        )}

        <Row label="Delivery">
          {/* An empty basket is charged nothing, and "Free" beside nothing to
              deliver would read as a promise. */}
          {pricing.shipping > 0 ? (
            formatPrice(pricing.shipping)
          ) : pricing.subtotal > 0 ? (
            <span className="font-medium text-success">Free</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Row>
      </dl>

      <Separator className={size === 'lg' ? 'my-5' : 'my-4'} />

      <div className="flex items-baseline justify-between">
        <span className={size === 'lg' ? 'text-h4' : 'text-small font-semibold'}>Total</span>
        <span className={size === 'lg' ? 'text-price-lg' : 'text-price'}>
          {formatPrice(pricing.total)}
        </span>
      </div>

      {/*
        GST is inside the prices above, not added to them — which is how Indian
        retail prices are quoted. Saying how much of the total it is answers the
        question a customer asks next, without a "Tax" row that would look like
        one more thing to pay. Orders from before GST was computed have none to
        report and say nothing.
      */}
      {pricing.tax > 0 && (
        <p className="text-caption mt-1.5 text-right text-muted-foreground">
          Includes {formatExactPrice(pricing.tax)} GST
        </p>
      )}
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
      <dt className="min-w-0 truncate text-muted-foreground">{label}</dt>
      <dd className={cn('shrink-0 font-medium tabular-nums', tone === 'success' && 'text-success')}>
        {children}
      </dd>
    </div>
  );
}
