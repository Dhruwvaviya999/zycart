import type mongoose from 'mongoose';
import type { QueryFilter } from 'mongoose';
import type { OrderStatus } from '../../models/order.model';
import { Shipment, type ShipmentDocument, type ShipmentStatus } from '../../models/shipment.model';
import type { AuditActor } from '../admin/audit.service';

/**
 * Keeping the parcel in step when the order moves first.
 *
 * ## The problem this solves
 *
 * There are two doors into "this order has shipped". An operator can advance
 * the shipment — the detailed path, where a carrier and a tracking number get
 * attached — or they can use the order's own fulfilment control, which has
 * existed since Phase 9 and which Phase 13 had no business breaking.
 *
 * If only the first door updated both records, the second would leave
 * `Order.status = SHIPPED` beside `Shipment.status = READY_TO_SHIP`: exactly
 * the contradictory pair the two-lifecycle design exists to prevent. So the
 * order's transition carries the shipment with it.
 *
 * ## Why this is its own module
 *
 * `order.service` calls this, and `shipment.service` calls `order.service`.
 * Putting the function in `shipment.service` would close that loop into an
 * import cycle. It lives here instead, importing only the model — which also
 * makes the direction of the dependency obvious: this file knows about
 * shipments, and knows nothing about how orders transition.
 *
 * ## Why it cannot recurse
 *
 * This writes shipment fields directly. It never calls the shipment service's
 * own transition function, and the shipment service's transition finds the
 * parcel already at its target when the order move calls back here, so the
 * update below matches nothing. One pass, in either direction.
 */
export async function syncShipmentToOrderStatus(
  orderId: mongoose.Types.ObjectId,
  next: OrderStatus,
  session: mongoose.ClientSession,
  actor: AuditActor | null,
): Promise<void> {
  /**
   * Only the three order states that have a shipment meaning at all.
   *
   * CONFIRMED and PROCESSING are absent on purpose: a parcel can legitimately
   * be packed and waiting while the order sits in either, so there is nothing
   * to bring into line.
   */
  if (next !== 'SHIPPED' && next !== 'DELIVERED' && next !== 'CANCELLED') return;

  const now = new Date();

  /**
   * The filter carries the precondition, so a shipment that is already ahead of
   * the order is left alone.
   *
   * An order marked DELIVERED whose parcel is already DELIVERED matches
   * nothing, and a `deliveredAt` recorded when the courier actually handed it
   * over is not overwritten with the moment an operator got round to clicking.
   */
  const filter: QueryFilter<ShipmentDocument> =
    next === 'SHIPPED'
      ? { order: orderId, status: 'READY_TO_SHIP' }
      : next === 'DELIVERED'
        ? { order: orderId, status: { $nin: ['DELIVERED', 'CANCELLED'] } }
        : { order: orderId, status: 'READY_TO_SHIP' };

  const shipment = await Shipment.findOne(filter).session(session);
  if (!shipment) return;

  const status: ShipmentStatus =
    next === 'SHIPPED' ? 'SHIPPED' : next === 'DELIVERED' ? 'DELIVERED' : 'CANCELLED';

  shipment.status = status;

  // Timestamps are only ever written when they were not already known, and only
  // for the thing that just happened. Nothing here back-fills a moment nobody
  // recorded.
  if (status === 'SHIPPED' && !shipment.shippedAt) shipment.shippedAt = now;
  if (status === 'DELIVERED') {
    if (!shipment.shippedAt) shipment.shippedAt = now;
    shipment.deliveredAt = now;
  }

  shipment.events.push({
    status,
    at: now,
    note: 'Recorded from the order',
    actorName: actor?.name ?? '',
  });

  await shipment.save({ session });
}
