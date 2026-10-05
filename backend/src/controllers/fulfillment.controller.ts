import type { Request, Response } from 'express';
import { dispatchProductAlerts, productIdsOf } from '../services/alerts/alert.service';
import * as shipmentService from '../services/fulfillment/shipment.service';
import * as refundService from '../services/returns/refund.service';
import * as returnService from '../services/returns/return.service';
import { requireActor } from '../utils/actor';
import { orderRefSchema } from '../validators/order.validator';
import {
  adminReturnQuerySchema,
  receiveReturnSchema,
  returnDecisionSchema,
  returnRefSchema,
  returnRejectionSchema,
} from '../validators/return.validator';
import {
  createShipmentSchema,
  shipmentStatusSchema,
  updateShipmentSchema,
} from '../validators/shipment.validator';

/**
 * Fulfilment and returns, from the operator's side.
 *
 * Split from `inventory.controller` for the same reason that one was split from
 * `admin.controller`: the console now covers three distinct jobs — running the
 * catalogue, running the day, and running what happens after the sale — and one
 * file for all of them would be six hundred lines of unrelated handlers.
 *
 * Every write below is attributable. `requireActor` reads the administrator
 * from the verified session, never from anything the client sent, and there is
 * no field in any schema here through which a caller could claim to be somebody
 * else or act on behalf of a customer.
 */

const orderRef = (req: Request): string =>
  orderRefSchema.parse({ orderRef: req.params.orderRef }).orderRef;

const returnRef = (req: Request): string =>
  returnRefSchema.parse({ returnRef: req.params.returnRef }).returnRef;

/* ---------------------------------------------------------------- */
/* Shipments                                                         */
/* ---------------------------------------------------------------- */

export async function createShipment(req: Request, res: Response): Promise<void> {
  const input = createShipmentSchema.parse(req.body);

  res.status(201).json({
    success: true,
    data: await shipmentService.createShipment(orderRef(req), input, requireActor(req)),
  });
}

/** Carrier details only. The status moves through its own endpoint. */
export async function updateShipment(req: Request, res: Response): Promise<void> {
  const input = updateShipmentSchema.parse(req.body);

  res.json({
    success: true,
    data: await shipmentService.updateShipment(orderRef(req), input, requireActor(req)),
  });
}

/**
 * Moves the parcel, and the order with it.
 *
 * A separate endpoint from the details update because the two obey different
 * rules — a tracking number can be corrected at any point, a status can only go
 * where the graph allows — and one endpoint taking both would have to apply the
 * loose rule to the strict field or the other way round.
 */
export async function updateShipmentStatus(req: Request, res: Response): Promise<void> {
  const input = shipmentStatusSchema.parse(req.body);

  res.json({
    success: true,
    data: await shipmentService.advanceShipment(req.env, orderRef(req), input, requireActor(req)),
  });
}

/* ---------------------------------------------------------------- */
/* Returns                                                           */
/* ---------------------------------------------------------------- */

export async function listReturns(req: Request, res: Response): Promise<void> {
  const query = adminReturnQuerySchema.parse(req.query);
  const { items, pagination } = await returnService.listAdminReturns(query);

  res.json({ success: true, data: items, pagination });
}

export async function getReturnsSummary(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await returnService.getReturnsSummary() });
}

export async function getReturn(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await returnService.getAdminReturn(returnRef(req)) });
}

export async function approveReturn(req: Request, res: Response): Promise<void> {
  const input = returnDecisionSchema.parse(req.body);

  res.json({
    success: true,
    data: await returnService.approveReturn(req.env, returnRef(req), input, requireActor(req)),
  });
}

/**
 * Declines a return.
 *
 * Uses the stricter schema, which requires a customer-facing explanation. That
 * is a deliberate asymmetry with approval: an approval speaks for itself, and a
 * rejection without a reason leaves a customer holding something they cannot
 * send back with no idea why.
 */
export async function rejectReturn(req: Request, res: Response): Promise<void> {
  const input = returnRejectionSchema.parse(req.body);

  res.json({
    success: true,
    data: await returnService.rejectReturn(returnRef(req), input, requireActor(req)),
  });
}

export async function receiveReturn(req: Request, res: Response): Promise<void> {
  const input = receiveReturnSchema.parse(req.body);
  const detail = await returnService.receiveReturn(returnRef(req), input, requireActor(req));

  // Resellable units back on the shelf may answer a back-in-stock alert (Phase 20).
  if (input.resellable) {
    dispatchProductAlerts(req.env, productIdsOf(detail.items));
  }

  res.json({ success: true, data: detail });
}

/**
 * Issues the refund.
 *
 * No body at all — deliberately. The amount is computed by the server from the
 * order's historical snapshot and the approved quantities, and capped at what
 * remains refundable on that order. An endpoint that accepted a figure would be
 * an endpoint through which the wrong figure could arrive.
 */
export async function refundReturn(req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: await refundService.issueReturnRefund(req.env, returnRef(req), requireActor(req)),
  });
}

/**
 * Asks Razorpay whether a pending refund has landed.
 *
 * There is no "mark as refunded" beside this, for the same reason there is no
 * "mark as paid" beside the order status control: whether money moved is a fact
 * at the gateway, and an administrative shortcut asserting it would make every
 * "Refunded" badge in ZyCart mean less.
 */
export async function reconcileReturnRefund(req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: await refundService.reconcileReturnRefund(req.env, returnRef(req), requireActor(req)),
  });
}
