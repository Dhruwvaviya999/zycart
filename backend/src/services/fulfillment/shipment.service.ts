import mongoose from 'mongoose';
import type { Env } from '../../config/env';
import { AuditLog } from '../../models/audit-log.model';
import type { OrderStatus } from '../../models/order.model';
import {
  Shipment,
  SHIPMENT_IMPLIES_ORDER,
  SHIPMENT_STATUS_FLOW,
  type ShipmentStatus,
} from '../../models/shipment.model';
import { AppError } from '../../utils/AppError';
import type {
  CreateShipmentInput,
  ShipmentStatusInput,
  UpdateShipmentInput,
} from '../../validators/shipment.validator';
import { changed, recordAudit, type AuditActor, type AuditChange } from '../admin/audit.service';
import { NotificationOutbox } from '../notifications/notification.service';
import { findOrderByRef, transitionOrderStatus } from '../order.service';
import { toShipmentView, type ShipmentDoc, type ShipmentView } from './shipment-view';

/**
 * The parcel, as an operation.
 *
 * ## The invariant this file exists to hold
 *
 * A shipment status implies an order status — the table is
 * `SHIPMENT_IMPLIES_ORDER` — and every transition here moves the order into
 * line **in the same transaction** as the shipment write. So the pair
 * `Shipment.status = DELIVERED` / `Order.status = PROCESSING` is not something
 * this system can be left holding: either both writes commit or neither does.
 *
 * The order's own lifecycle stays authoritative throughout. Nothing here writes
 * `Order.status` directly; it calls `transitionOrderStatus`, which owns the
 * transition graph, the cancellation path and the audit row. A shipment move
 * that would require an illegal order move is refused by that function, with
 * its message, rather than by a second copy of the rules living here.
 *
 * ## What this file will not do
 *
 * There is no carrier integration and this phase did not pretend otherwise. No
 * tracking number is validated against a carrier's format, no transit time is
 * estimated, and no status is polled from anybody's API. Every field here is
 * what a person entered or what a person recorded happening, which is why the
 * customer-facing timeline can be read literally.
 */

type HydratedShipment = InstanceType<typeof Shipment>;

/**
 * Where a shipment may be created from.
 *
 * PENDING is absent because nothing is confirmed — packing an order whose
 * online payment has not landed would be picking stock for a sale that may
 * never happen. DELIVERED and CANCELLED are absent because the fulfilment story
 * is over.
 *
 * SHIPPED *is* present, and that is a deliberate accommodation: an operator who
 * marked an order shipped from the order page, then obtained a tracking number,
 * must be able to attach it. See `dispatchedAtFromAudit` for how that shipment
 * gets an honest dispatch time.
 */
const SHIPPABLE_ORDER_STATUSES: readonly OrderStatus[] = ['CONFIRMED', 'PROCESSING', 'SHIPPED'];

/**
 * Statuses an operator may move a shipment to by hand.
 *
 * CANCELLED is excluded on purpose. A cancelled parcel is a *consequence* of a
 * cancelled order — it restores stock and may owe a refund — and offering it as
 * a shipment action would create a second, quieter route into a decision that
 * deliberately asks for confirmation. Cancelling the order cancels the parcel,
 * through `syncShipmentToOrderStatus`.
 */
export function operatorReachable(status: ShipmentStatus): ShipmentStatus[] {
  return [...(SHIPMENT_STATUS_FLOW[status] ?? [])].filter((next) => next !== 'CANCELLED');
}

function assertShippableOrder(status: OrderStatus): void {
  if (SHIPPABLE_ORDER_STATUSES.includes(status)) return;

  if (status === 'PENDING') {
    throw new AppError(
      'This order has not been confirmed yet, so there is nothing to pack. Confirm the payment ' +
        'first.',
      409,
    );
  }

  throw new AppError(
    `An order that is ${status.toLowerCase()} cannot have a shipment created for it.`,
    409,
  );
}

/**
 * When an already-shipped order was actually dispatched.
 *
 * Reached only when a shipment is created for an order somebody had already
 * marked SHIPPED. The moment of dispatch is not "now" — it was whenever that
 * transition happened — and writing `new Date()` here would put a date on the
 * customer's timeline that is simply wrong.
 *
 * The audit trail recorded it, so that is where it comes from. Null when there
 * is no such row (an order moved before Phase 12's audit trail existed), and
 * the interface then says the dispatch date was not recorded rather than
 * showing one that was not.
 */
async function dispatchedAtFromAudit(
  orderId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession,
): Promise<Date | null> {
  const entry = await AuditLog.findOne({
    entityType: 'ORDER',
    entityId: orderId,
    action: 'ORDER_STATUS_CHANGED',
    'changes.to': 'SHIPPED',
  })
    .sort({ createdAt: 1 })
    .select('createdAt')
    .session(session);

  return entry?.createdAt ?? null;
}

/**
 * Creates the parcel for an order.
 *
 * The initial status is **derived, not chosen**. An order still being prepared
 * gets a READY_TO_SHIP parcel; one already marked shipped gets a SHIPPED parcel
 * carrying the dispatch time the audit trail recorded. Letting an operator pick
 * would let them pick a status that contradicts the order, and the only
 * reasonable response would be an error message explaining a rule the form
 * could have applied itself.
 *
 * The unique index on `order` is what makes a double-submitted form produce one
 * parcel: the second insert loses, and the duplicate is reported as the
 * conflict it is rather than as a 500.
 */
export async function createShipment(
  orderRef: string,
  input: CreateShipmentInput,
  actor: AuditActor,
): Promise<ShipmentView> {
  const session = await mongoose.startSession();

  try {
    let created: HydratedShipment | undefined;

    await session.withTransaction(async () => {
      const order = await findOrderByRef(orderRef, session);
      assertShippableOrder(order.status);

      const existing = await Shipment.findOne({ order: order._id }).session(session);
      if (existing) {
        throw new AppError(
          `${order.orderNumber} already has a shipment. Update it instead of creating another.`,
          409,
        );
      }

      const alreadyDispatched = order.status === 'SHIPPED';
      const status: ShipmentStatus = alreadyDispatched ? 'SHIPPED' : 'READY_TO_SHIP';
      const shippedAt = alreadyDispatched ? await dispatchedAtFromAudit(order._id, session) : null;

      const now = new Date();

      const [shipment] = await Shipment.create(
        [
          {
            order: order._id,
            orderNumber: order.orderNumber,
            user: order.user,
            status,
            carrier: input.carrier ?? '',
            trackingNumber: input.trackingNumber ?? '',
            trackingUrl: input.trackingUrl ?? '',
            estimatedDeliveryAt: input.estimatedDeliveryAt ?? null,
            note: input.note ?? '',
            shippedAt,
            createdByName: actor.name,
            events: [
              {
                status,
                // The event records when the parcel reached this status, and for
                // an already-dispatched order that is the audited dispatch time,
                // not the moment the record was typed up.
                at: shippedAt ?? now,
                note: alreadyDispatched ? 'Recorded against an order already marked shipped' : '',
                actorName: actor.name,
              },
            ],
          },
        ],
        { session },
      );

      // `Model.create` with an array always returns one document per input, so
      // this cannot be undefined — the guard is here because the type says it
      // can, and asserting it away would hide a real failure if that changed.
      if (!shipment) throw new AppError('Could not create the shipment', 500);

      await recordAudit(
        {
          actor,
          action: 'SHIPMENT_CREATED',
          entityType: 'SHIPMENT',
          entityId: shipment._id,
          entityLabel: order.orderNumber,
          summary:
            `Shipment created for ${order.orderNumber}` +
            (input.carrier ? ` · ${input.carrier}` : '') +
            (input.trackingNumber ? ` · ${input.trackingNumber}` : ''),
          changes: [{ field: 'status', from: '', to: status }],
          note: input.note,
        },
        session,
      );

      created = shipment;
    });

    if (!created) throw new AppError('Could not create the shipment', 500);
    return toShipmentView(created as unknown as ShipmentDoc);
  } catch (error) {
    // The unique index caught a second submission that got past the read above.
    if (typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000) {
      throw new AppError(
        'A shipment for this order was just created. Refresh to see it.',
        409,
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * Edits the carrier details, never the status.
 *
 * Two operations rather than one, because they are governed by different rules:
 * a tracking number can be corrected at any point in a parcel's life, and a
 * status can only move where the graph allows. A single endpoint taking both
 * would have to apply the strict rule to the loose field or the loose rule to
 * the strict one.
 *
 * The update names every field it writes. There is no spread of the request
 * body anywhere in this file, so no `status`, `order`, `user` or `deliveredAt`
 * can arrive through it however the request is shaped.
 */
export async function updateShipment(
  orderRef: string,
  input: UpdateShipmentInput,
  actor: AuditActor,
): Promise<ShipmentView> {
  const session = await mongoose.startSession();

  try {
    let updated: HydratedShipment | undefined;

    await session.withTransaction(async () => {
      const order = await findOrderByRef(orderRef, session);
      const shipment = await Shipment.findOne({ order: order._id }).session(session);

      if (!shipment) {
        throw new AppError('This order does not have a shipment yet.', 404);
      }

      if (shipment.status === 'CANCELLED') {
        throw new AppError('This shipment was cancelled with its order and cannot be edited.', 409);
      }

      const changes: AuditChange[] = [];

      // Named one at a time on purpose; see the header. `undefined` means "not
      // sent", which is distinct from an empty string meaning "clear it".
      if (input.carrier !== undefined) {
        changes.push(...changed('carrier', shipment.carrier, input.carrier));
        shipment.carrier = input.carrier;
      }

      if (input.trackingNumber !== undefined) {
        changes.push(...changed('trackingNumber', shipment.trackingNumber, input.trackingNumber));
        shipment.trackingNumber = input.trackingNumber;
      }

      if (input.trackingUrl !== undefined) {
        changes.push(...changed('trackingUrl', shipment.trackingUrl, input.trackingUrl));
        shipment.trackingUrl = input.trackingUrl;
      }

      if (input.estimatedDeliveryAt !== undefined) {
        changes.push(
          ...changed(
            'estimatedDelivery',
            shipment.estimatedDeliveryAt?.toISOString().slice(0, 10) ?? '',
            input.estimatedDeliveryAt?.toISOString().slice(0, 10) ?? '',
          ),
        );
        shipment.estimatedDeliveryAt = input.estimatedDeliveryAt;
      }

      if (input.note !== undefined) {
        changes.push(...changed('note', shipment.note, input.note));
        shipment.note = input.note;
      }

      if (changes.length === 0) {
        throw new AppError('Nothing was changed.', 400);
      }

      await shipment.save({ session });

      await recordAudit(
        {
          actor,
          action: 'SHIPMENT_UPDATED',
          entityType: 'SHIPMENT',
          entityId: shipment._id,
          entityLabel: order.orderNumber,
          summary: `Shipment details updated for ${order.orderNumber}`,
          changes,
        },
        session,
      );

      updated = shipment;
    });

    if (!updated) throw new AppError('Could not update the shipment', 500);
    return toShipmentView(updated as unknown as ShipmentDoc);
  } finally {
    await session.endSession();
  }
}

/**
 * Moves the parcel, and the order with it.
 *
 * ## The two rules, in order
 *
 * 1. `SHIPMENT_STATUS_FLOW` decides whether the parcel may make this move.
 *    DELIVERED does not go back to SHIPPED, and nothing reaches DELIVERED
 *    without having been dispatched.
 * 2. `SHIPMENT_IMPLIES_ORDER` decides what the order must therefore say, and
 *    `transitionOrderStatus` applies it under its own rules. If the order
 *    cannot legally make that move, the whole transaction aborts — which is
 *    correct: a parcel cannot be in transit for an order that was never
 *    dispatched.
 *
 * Timestamps are written for the thing that is happening now and nothing else.
 * A shipment that jumps straight from READY_TO_SHIP to DELIVERED — which the
 * graph does not allow, but the code is written as though it might — would
 * never gain a `shippedAt` it did not earn.
 */
export async function advanceShipment(
  env: Env,
  orderRef: string,
  input: ShipmentStatusInput,
  actor: AuditActor,
): Promise<ShipmentView> {
  const session = await mongoose.startSession();
  /**
   * Any customer notification this move raises is collected here and attempted
   * after the commit. Nothing in this transaction talks to a mail server: the
   * parcel has moved whether or not a message goes out, and holding a
   * transaction open across SMTP would make the reverse true.
   */
  const outbox = new NotificationOutbox();

  try {
    let updated: HydratedShipment | undefined;

    await session.withTransaction(async () => {
      const order = await findOrderByRef(orderRef, session);
      const shipment = await Shipment.findOne({ order: order._id }).session(session);

      if (!shipment) {
        throw new AppError('This order does not have a shipment yet.', 404);
      }

      const current = shipment.status as ShipmentStatus;
      const next = input.status;

      if (current === next) {
        throw new AppError(`This shipment is already ${humanShipmentStatus(next)}.`, 409);
      }

      if (!operatorReachable(current).includes(next)) {
        throw new AppError(
          `A shipment that is ${humanShipmentStatus(current)} cannot be moved to ` +
            `${humanShipmentStatus(next)}.`,
          409,
        );
      }

      const now = new Date();

      shipment.status = next;
      if (next === 'SHIPPED' && !shipment.shippedAt) shipment.shippedAt = now;
      if (next === 'DELIVERED') shipment.deliveredAt = now;
      if (input.note !== undefined) shipment.note = input.note;

      shipment.events.push({
        status: next,
        at: now,
        note: input.note ?? '',
        actorName: actor.name,
      });

      await shipment.save({ session });

      /**
       * The order follows. Skipped when the implied status is already the
       * current one — an EXCEPTION on an order that is already SHIPPED implies
       * SHIPPED, and asking for a move to where it already is would be refused.
       */
      const implied = SHIPMENT_IMPLIES_ORDER[next];

      if (implied && implied !== order.status) {
        await transitionOrderStatus(order, implied as OrderStatus, session, {
          note: input.note,
          actor,
          outbox,
        });
      }

      await recordAudit(
        {
          actor,
          action: 'SHIPMENT_STATUS_CHANGED',
          entityType: 'SHIPMENT',
          entityId: shipment._id,
          entityLabel: order.orderNumber,
          summary:
            `Shipment for ${order.orderNumber} moved from ${humanShipmentStatus(current)} to ` +
            humanShipmentStatus(next),
          changes: [{ field: 'shipmentStatus', from: current, to: next }],
          note: input.note,
        },
        session,
      );

      updated = shipment;
    });

    if (!updated) throw new AppError('Could not update the shipment', 500);

    await outbox.flush(env);

    return toShipmentView(updated as unknown as ShipmentDoc);
  } finally {
    await session.endSession();
  }
}

/** `OUT_FOR_DELIVERY` -> `out for delivery`. For error messages and summaries. */
export function humanShipmentStatus(status: ShipmentStatus): string {
  return status.toLowerCase().replace(/_/g, ' ');
}

/**
 * What the console may do about fulfilment right now.
 *
 * Computed on the server from order state and shipment state together, so the
 * action bar offers exactly what would succeed. The interface does not know the
 * rules and does not try to — the same arrangement `allowedNextStatuses` set up
 * for order transitions in Phase 9.
 */
export interface FulfillmentCapabilities {
  canCreateShipment: boolean;
  /** Why not, for the operator. Empty when it can. */
  createBlockedReason: string;
  shipmentStatuses: ShipmentStatus[];
}

export function fulfillmentCapabilities(
  orderStatus: OrderStatus,
  shipment: ShipmentView | null,
): FulfillmentCapabilities {
  if (shipment) {
    return {
      canCreateShipment: false,
      createBlockedReason: '',
      shipmentStatuses:
        shipment.status === 'CANCELLED' ? [] : operatorReachable(shipment.status),
    };
  }

  const shippable = SHIPPABLE_ORDER_STATUSES.includes(orderStatus);

  return {
    canCreateShipment: shippable,
    createBlockedReason: shippable
      ? ''
      : orderStatus === 'PENDING'
        ? 'Confirm this order before packing it.'
        : `An order that is ${orderStatus.toLowerCase()} can no longer be shipped.`,
    shipmentStatuses: [],
  };
}
