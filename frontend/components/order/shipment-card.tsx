import { ExternalLink, PackageX, Truck, TriangleAlert } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { SHIPMENT_LABEL, type Shipment } from '@/types/fulfillment';
import { cn } from '@/lib/utils';

/**
 * Where the parcel is, for the customer.
 *
 * ## The empty case is the important one
 *
 * Most orders in a real database have no shipment: everything placed before
 * Phase 13, and everything not yet packed. This component's first job is to say
 * so plainly. It does not render a skeleton that never fills, and it does not
 * borrow the order's status to imply a carrier — it says tracking is not
 * available, which is true, and why.
 *
 * ## The tracking link
 *
 * The URL was validated as an absolute `https:` address before it was stored,
 * so `javascript:` and `data:` cannot reach this attribute. It is rendered as
 * an ordinary anchor — never interpolated into markup — and it opens in a new
 * tab with `rel="noopener noreferrer"`, so the carrier's page gets no handle on
 * the order page it came from.
 */
export function ShipmentCard({ shipment, orderStatus }: { shipment: Shipment | null; orderStatus: string }) {
  if (!shipment) return <NoShipment orderStatus={orderStatus} />;

  const problem = shipment.status === 'EXCEPTION';
  const cancelled = shipment.status === 'CANCELLED';

  return (
    <section
      aria-labelledby="shipment-heading"
      className={cn(
        'rounded-2xl border p-5',
        problem ? 'border-amber-400/40 bg-amber-400/5' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 id="shipment-heading" className="text-small flex items-center gap-2 font-semibold">
          {problem ? (
            <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
          ) : (
            <Truck className="size-4 text-muted-foreground" aria-hidden />
          )}
          Delivery
        </h3>

        {/* Words carry the state; the tone only reinforces it. */}
        <span
          className={cn(
            'text-caption inline-flex shrink-0 items-center rounded-full px-2.5 py-1 font-semibold',
            cancelled
              ? 'bg-muted text-muted-foreground'
              : problem
                ? 'bg-amber-400/15 text-amber-700 dark:text-amber-300'
                : shipment.status === 'DELIVERED'
                  ? 'bg-success/12 text-success'
                  : 'bg-brand-subtle text-brand',
          )}
        >
          {SHIPMENT_LABEL[shipment.status]}
        </span>
      </div>

      {problem && shipment.note && (
        <p className="text-caption mt-3 text-pretty text-foreground">{shipment.note}</p>
      )}

      <dl className="mt-4 space-y-2.5">
        {shipment.carrier && <Row label="Carrier">{shipment.carrier}</Row>}

        {shipment.trackingNumber && (
          <Row label="Tracking number">
            {/* Long references wrap rather than stretching the card sideways. */}
            <span className="break-all tabular-nums">{shipment.trackingNumber}</span>
          </Row>
        )}

        {shipment.shippedAt && <Row label="Dispatched">{formatDate(shipment.shippedAt)}</Row>}

        {shipment.deliveredAt ? (
          <Row label="Delivered">{formatDate(shipment.deliveredAt)}</Row>
        ) : (
          <Row label="Estimated delivery">
            {shipment.estimatedDeliveryAt ? (
              formatDate(shipment.estimatedDeliveryAt)
            ) : (
              // Better than a made-up date, and said in words rather than left
              // as an empty row the customer has to interpret.
              <span className="font-normal text-muted-foreground">Not available yet</span>
            )}
          </Row>
        )}
      </dl>

      {shipment.trackingUrl && (
        <a
          href={shipment.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring text-small mt-4 inline-flex items-center gap-1.5 rounded-md font-medium text-brand underline-offset-4 hover:underline"
        >
          Track shipment
          <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </section>
  );
}

/**
 * No parcel on record, said honestly and with the reason.
 *
 * Three different reasons, three different sentences. "Tracking isn't
 * available" alone would leave a customer whose order shipped last week
 * wondering whether something is broken.
 */
function NoShipment({ orderStatus }: { orderStatus: string }) {
  const body =
    orderStatus === 'CANCELLED'
      ? 'This order was cancelled, so nothing was sent.'
      : orderStatus === 'DELIVERED' || orderStatus === 'SHIPPED'
        ? 'Tracking details were not recorded for this order. If you need them, contact support and we will look it up.'
        : 'Tracking will appear here once your order is on its way.';

  return (
    <section aria-labelledby="shipment-heading" className="rounded-2xl border border-border p-5">
      <h3 id="shipment-heading" className="text-small flex items-center gap-2 font-semibold">
        <PackageX className="size-4 text-muted-foreground" aria-hidden />
        Delivery
      </h3>
      <p className="text-caption mt-2.5 text-pretty text-muted-foreground">{body}</p>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-small flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium">{children}</dd>
    </div>
  );
}
