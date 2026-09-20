import type { Types } from 'mongoose';
import { Shipment, type ShipmentDocument, type ShipmentStatus } from '../../models/shipment.model';

/**
 * How a shipment is rendered, and where it is read from.
 *
 * Kept apart from `shipment.service` so `order.service` can attach a parcel to
 * an order detail without importing the module that transitions shipments —
 * which imports `order.service` in turn. Reading and writing have different
 * dependency shapes, and separating them is what keeps the graph acyclic.
 */

export interface ShipmentEventView {
  status: ShipmentStatus;
  at: string;
  note: string;
  actorName: string;
}

export interface ShipmentView {
  id: string;
  status: ShipmentStatus;
  carrier: string;
  trackingNumber: string;
  /** Always absolute and https, or empty. Validated before it was ever stored. */
  trackingUrl: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  estimatedDeliveryAt: string | null;
  note: string;
  events: ShipmentEventView[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Deliberately no `allowedStatuses` here.
 *
 * Where a parcel may go next is an *operator* question, and the answer is
 * narrower than the raw transition graph — moving a shipment to CANCELLED is
 * not an action the console offers. `fulfillmentCapabilities` in the service
 * answers it, with the order's state in hand as well as the parcel's. Putting a
 * second, wider answer on a shape the customer's page also receives would have
 * been a list of actions nobody should act on.
 */
export type ShipmentDoc = ShipmentDocument & { _id: Types.ObjectId };

/**
 * One projection, used by the customer's order page and the admin's alike.
 *
 * There is nothing on a shipment that is unsafe to show a customer — a carrier
 * name, a tracking number, dates they are waiting on — so unlike the return
 * projections there is no second, narrower shape here. What the admin gets
 * extra is the surrounding order and the actions, not different shipment data.
 */
export function toShipmentView(shipment: ShipmentDoc): ShipmentView {
  return {
    id: String(shipment._id),
    status: shipment.status as ShipmentStatus,
    carrier: shipment.carrier ?? '',
    trackingNumber: shipment.trackingNumber ?? '',
    trackingUrl: shipment.trackingUrl ?? '',
    shippedAt: shipment.shippedAt ? shipment.shippedAt.toISOString() : null,
    deliveredAt: shipment.deliveredAt ? shipment.deliveredAt.toISOString() : null,
    estimatedDeliveryAt: shipment.estimatedDeliveryAt
      ? shipment.estimatedDeliveryAt.toISOString()
      : null,
    note: shipment.note ?? '',
    events: (shipment.events ?? []).map((event) => ({
      status: event.status as ShipmentStatus,
      at: event.at.toISOString(),
      note: event.note ?? '',
      actorName: event.actorName ?? '',
    })),
    createdAt: shipment.createdAt.toISOString(),
    updatedAt: shipment.updatedAt.toISOString(),
  };
}

/**
 * The parcel for one order, or null.
 *
 * Null is a first-class answer, not an error: every order placed before Phase
 * 13 has no shipment, and so does every order that has not been packed yet. The
 * interface says "tracking is not available for this order" rather than
 * inventing a carrier and a date.
 */
export async function findOrderShipment(orderId: Types.ObjectId): Promise<ShipmentView | null> {
  const shipment = await Shipment.findOne({ order: orderId });
  return shipment ? toShipmentView(shipment as unknown as ShipmentDoc) : null;
}
