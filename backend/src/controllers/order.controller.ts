import type { Request, Response } from 'express';
import { isRazorpayConfigured } from '../config/env';
import { getCustomerInvoice } from '../services/invoices/invoice.service';
import { dispatchProductAlerts, productIdsOf } from '../services/alerts/alert.service';
import * as orderService from '../services/order.service';
import { AppError } from '../utils/AppError';
import {
  cancelOrderSchema,
  createOrderSchema,
  orderQuerySchema,
  orderRefSchema,
} from '../validators/order.validator';

function currentUserId(req: Request): string {
  if (!req.user) throw new AppError('Not authenticated', 401);
  return req.user.id;
}

function orderRef(req: Request): string {
  return orderRefSchema.parse({ orderRef: req.params.orderRef }).orderRef;
}

export async function listOrders(req: Request, res: Response): Promise<void> {
  const query = orderQuerySchema.parse(req.query);
  const { items, pagination } = await orderService.listOrders(currentUserId(req), query);

  res.json({ success: true, data: items, pagination });
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await orderService.getOrder(currentUserId(req), orderRef(req)) });
}

/**
 * Answers with the created order rather than just its number, so the
 * confirmation page renders what the database actually holds.
 */
export async function createOrder(req: Request, res: Response): Promise<void> {
  const { addressId, paymentMethod, couponCode } = createOrderSchema.parse(req.body);

  // Refused rather than quietly downgraded to cash on delivery: a customer who
  // chose to pay online must not be told an order is placed under terms they
  // did not pick.
  if (paymentMethod === 'RAZORPAY' && !isRazorpayConfigured(req.env)) {
    throw new AppError('Online payment is not available at the moment.', 503);
  }

  const userId = currentUserId(req);
  const orderNumber = await orderService.createOrder(req.env, userId, {
    addressId,
    paymentMethod,
    couponCode,
  });

  res.status(201).json({ success: true, data: await orderService.getOrder(userId, orderNumber) });
}

export async function cancelOrder(req: Request, res: Response): Promise<void> {
  const input = cancelOrderSchema.parse(req.body);
  const order = await orderService.cancelOrder(currentUserId(req), orderRef(req), input);

  // Units given back may answer somebody else's back-in-stock alert (Phase 20).
  dispatchProductAlerts(req.env, productIdsOf(order.items));

  res.json({ success: true, data: order });
}

/**
 * The tax invoice, once the order has shipped.
 *
 * Scoped to the owner exactly as the order is, so another customer's invoice is
 * simply not found. The response is data, not a PDF: the storefront lays it out
 * for printing, which keeps one renderer for screen and paper.
 */
export async function getInvoice(req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: await getCustomerInvoice(req.env, currentUserId(req), orderRef(req)),
  });
}
