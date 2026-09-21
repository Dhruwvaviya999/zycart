'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { ExternalLink, Loader2, Pencil, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthError } from '@/components/auth/auth-error';
import { StatusBadge } from '@/components/admin/admin-ui';
import { shipmentTone } from '@/components/admin/status-tones';
import { createShipment, updateShipment, updateShipmentStatus } from '@/services/admin.service';
import { fieldErrors, toErrorMessage } from '@/services/api';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  CARRIER_SUGGESTIONS,
  SHIPMENT_ADMIN_LABEL,
  type Shipment,
  type ShipmentStatus,
} from '@/types/fulfillment';
import type { FulfillmentCapabilities } from '@/types/admin';

/**
 * The parcel, for an operator.
 *
 * ## The console knows no rules
 *
 * Which statuses this parcel may move to arrives in `capabilities`, computed by
 * the server from the order's state and the parcel's together. Whether a
 * shipment can be created at all arrives the same way, with the reason when it
 * cannot. This component renders those and works nothing out for itself, so a
 * button is never offered that the endpoint behind it would refuse — the same
 * arrangement `OrderStatusControl` has had since Phase 9.
 *
 * ## No optimistic updates
 *
 * Every action here changes fulfilment state, and moving a parcel moves the
 * order with it. So the screen waits for the server and then re-renders from
 * it, rather than guessing and correcting. A stale-state failure — another
 * operator moved this parcel while this one was reading it — comes back as the
 * server's own sentence, which is more useful than anything generic.
 */
export function ShipmentPanel({
  orderNumber,
  shipment,
  capabilities,
}: {
  orderNumber: string;
  shipment: Shipment | null;
  capabilities: FulfillmentCapabilities;
}) {
  return (
    /**
     * A named landmark, not just a box.
     *
     * `aria-labelledby` pointing at the heading turns this into a `region` a
     * screen reader can jump to and announce as "Shipment" — the order page has
     * six of these panels, and an unnamed `<section>` is not a landmark at all.
     */
    <section
      aria-labelledby="shipment-panel-heading"
      className="rounded-xl border border-border bg-surface/40 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="shipment-panel-heading"
          className="text-small flex items-center gap-2 font-semibold"
        >
          <Truck className="size-4 text-muted-foreground" aria-hidden />
          Shipment
        </h2>

        {shipment && (
          <StatusBadge tone={shipmentTone(shipment.status)}>
            {SHIPMENT_ADMIN_LABEL[shipment.status]}
          </StatusBadge>
        )}
      </div>

      <div className="mt-3">
        {shipment ? (
          <ExistingShipment
            orderNumber={orderNumber}
            shipment={shipment}
            capabilities={capabilities}
          />
        ) : (
          <NoShipment orderNumber={orderNumber} capabilities={capabilities} />
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */

function NoShipment({
  orderNumber,
  capabilities,
}: {
  orderNumber: string;
  capabilities: FulfillmentCapabilities;
}) {
  const [creating, setCreating] = useState(false);

  if (!capabilities.canCreateShipment) {
    return (
      <p className="text-caption text-pretty text-muted-foreground">
        {capabilities.createBlockedReason ||
          'No shipment has been created for this order, and one cannot be created now.'}
      </p>
    );
  }

  if (creating) {
    return (
      <ShipmentForm
        orderNumber={orderNumber}
        mode="create"
        onDone={() => setCreating(false)}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <>
      <p className="text-caption text-pretty text-muted-foreground">
        Nothing has been dispatched yet. Create a shipment to record the carrier and tracking
        details the customer will see.
      </p>
      <Button size="cta" variant="brand" onClick={() => setCreating(true)} className="mt-4 w-full">
        Create shipment
      </Button>
    </>
  );
}

function ExistingShipment({
  orderNumber,
  shipment,
  capabilities,
}: {
  orderNumber: string;
  shipment: Shipment;
  capabilities: FulfillmentCapabilities;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<ShipmentStatus | null>(null);
  const [error, setError] = useState<string>();

  async function move(next: ShipmentStatus) {
    if (busy) return;

    setBusy(next);
    setError(undefined);

    try {
      await updateShipmentStatus(orderNumber, next);
      router.refresh();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  if (editing) {
    return (
      <ShipmentForm
        orderNumber={orderNumber}
        mode="edit"
        shipment={shipment}
        onDone={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <AuthError message={error} />

      <dl className={error ? 'mt-4 space-y-2' : 'space-y-2'}>
        <Row label="Carrier">
          {shipment.carrier || <span className="text-muted-foreground">Not set</span>}
        </Row>
        <Row label="Tracking">
          {shipment.trackingNumber ? (
            <span className="break-all">{shipment.trackingNumber}</span>
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </Row>
        <Row label="Dispatched">
          {shipment.shippedAt ? (
            formatDate(shipment.shippedAt)
          ) : (
            // Never substituted with the record's creation time: a parcel that
            // has not left has no dispatch date, and one recorded against an
            // order marked shipped before Phase 13 may genuinely have none.
            <span className="text-muted-foreground">Not recorded</span>
          )}
        </Row>
        <Row label="Estimated">
          {shipment.estimatedDeliveryAt ? (
            formatDate(shipment.estimatedDeliveryAt)
          ) : (
            <span className="text-muted-foreground">None given</span>
          )}
        </Row>
        {shipment.deliveredAt && <Row label="Delivered">{formatDate(shipment.deliveredAt)}</Row>}
      </dl>

      {shipment.trackingUrl && (
        <a
          href={shipment.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring text-caption mt-3 inline-flex items-center gap-1.5 rounded-md font-medium text-brand underline-offset-4 hover:underline"
        >
          Open tracking page
          <ExternalLink className="size-3" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}

      {shipment.note && (
        <p className="text-caption mt-3 border-t border-border pt-3 text-pretty text-muted-foreground">
          {shipment.note}
        </p>
      )}

      {capabilities.shipmentStatuses.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          {capabilities.shipmentStatuses.map((next) => (
            <Button
              key={next}
              size="cta"
              variant={next === 'EXCEPTION' ? 'outline' : 'brand'}
              onClick={() => move(next)}
              disabled={busy !== null}
              className="w-full"
            >
              {busy === next ? (
                <>
                  <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
                  Updating…
                </>
              ) : next === 'EXCEPTION' ? (
                'Report a problem'
              ) : (
                `Mark ${SHIPMENT_ADMIN_LABEL[next].toLowerCase()}`
              )}
            </Button>
          ))}
        </div>
      )}

      {shipment.status !== 'CANCELLED' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing(true)}
          className="mt-2 w-full"
        >
          <Pencil className="size-3.5" data-icon="inline-start" aria-hidden />
          Edit tracking details
        </Button>
      )}

      {shipment.events.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="text-caption font-semibold text-muted-foreground">Parcel history</h3>
          <ol className="mt-2 space-y-1.5">
            {shipment.events.map((event, index) => (
              <li key={`${event.at}-${String(index)}`} className="text-caption">
                <span className="font-medium">{SHIPMENT_ADMIN_LABEL[event.status]}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  {formatDateTime(event.at)}
                  {event.actorName ? ` · ${event.actorName}` : ''}
                </span>
                {event.note && (
                  <span className="block text-pretty text-muted-foreground">{event.note}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */

/**
 * The carrier details form, for both creating and editing.
 *
 * ## Why there is no status field
 *
 * Creating a shipment does not ask what state it should be in. The server
 * derives that from the order — ready to ship for one being prepared, shipped
 * for one already marked dispatched — because a chosen value could contradict
 * the order and the only possible response would be an error explaining a rule
 * this form could have applied itself.
 *
 * ## Field errors come from the server
 *
 * The tracking URL is the interesting one: the browser marks the input
 * `type="url"`, and the server independently parses it and refuses anything
 * that is not an absolute `https:` address. Only the second of those is a
 * security control; the first is a courtesy. Zod's field messages are shown
 * against the inputs they belong to.
 */
function ShipmentForm({
  orderNumber,
  mode,
  shipment,
  onDone,
  onCancel,
}: {
  orderNumber: string;
  mode: 'create' | 'edit';
  shipment?: Shipment;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const listId = useId();

  const [carrier, setCarrier] = useState(shipment?.carrier ?? '');
  const [trackingNumber, setTrackingNumber] = useState(shipment?.trackingNumber ?? '');
  const [trackingUrl, setTrackingUrl] = useState(shipment?.trackingUrl ?? '');
  const [estimate, setEstimate] = useState(
    shipment?.estimatedDeliveryAt ? shipment.estimatedDeliveryAt.slice(0, 10) : '',
  );
  const [note, setNote] = useState(shipment?.note ?? '');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(undefined);
    setFields({});

    try {
      if (mode === 'create') {
        // Only what was filled in. An empty string is not "clear it" here —
        // there is nothing yet to clear — so blanks are simply omitted.
        await createShipment(orderNumber, {
          ...(carrier.trim() ? { carrier: carrier.trim() } : {}),
          ...(trackingNumber.trim() ? { trackingNumber: trackingNumber.trim() } : {}),
          ...(trackingUrl.trim() ? { trackingUrl: trackingUrl.trim() } : {}),
          ...(estimate ? { estimatedDeliveryAt: estimate } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        });
      } else {
        // Every field is sent, so clearing one works: an empty string clears
        // the text fields and an explicit null clears the date.
        await updateShipment(orderNumber, {
          carrier: carrier.trim(),
          trackingNumber: trackingNumber.trim(),
          trackingUrl: trackingUrl.trim(),
          estimatedDeliveryAt: estimate || null,
          note: note.trim(),
        });
      }

      onDone();
      router.refresh();
    } catch (cause) {
      // The form keeps everything the operator typed. Losing a tracking number
      // to a validation failure would mean reading it off the label again.
      setError(toErrorMessage(cause));
      setFields(fieldErrors(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <AuthError message={error} />

      <div className={error ? 'mt-4 space-y-3' : 'space-y-3'}>
        <Field label="Carrier" error={fields.carrier}>
          <Input
            value={carrier}
            onChange={(event) => setCarrier(event.target.value)}
            list={listId}
            maxLength={60}
            placeholder="Delhivery"
            autoComplete="off"
          />
          {/* Suggestions, not a constraint: a local courier has to be typeable. */}
          <datalist id={listId}>
            {CARRIER_SUGGESTIONS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>

        <Field label="Tracking number" error={fields.trackingNumber}>
          <Input
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
            maxLength={60}
            placeholder="ABC123456789"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field label="Tracking URL" error={fields.trackingUrl}>
          <Input
            type="url"
            value={trackingUrl}
            onChange={(event) => setTrackingUrl(event.target.value)}
            maxLength={500}
            placeholder="https://…"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field label="Estimated delivery" error={fields.estimatedDeliveryAt}>
          <Input
            type="date"
            value={estimate}
            onChange={(event) => setEstimate(event.target.value)}
          />
        </Field>

        <Field label="Note" error={fields.note}>
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={300}
            placeholder="Anything worth recording"
          />
        </Field>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          size="cta"
          variant="outline"
          onClick={onCancel}
          disabled={busy}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button type="submit" size="cta" variant="brand" disabled={busy} className="flex-1">
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
              Saving…
            </>
          ) : mode === 'create' ? (
            'Create shipment'
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </form>
  );
}

/**
 * A labelled input.
 *
 * The `<label>` **wraps** its control rather than pointing at it with `for`.
 * Implicit association needs no id, which matters here because the control is
 * passed in as a child — a `for` on the wrapper would have had to target a
 * `<div>`, which is not labelable, and the field would have been announced with
 * no name at all. Wrapping is correct for a single control and cannot come
 * apart.
 */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-caption block font-medium">
        <span className="mb-1.5 block">{label}</span>
        {children}
      </Label>
      {error && (
        <p role="alert" className="text-caption font-medium text-destructive">
          {label} {error}
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-small flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium">{children}</dd>
    </div>
  );
}
