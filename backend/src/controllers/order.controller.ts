import type { Request, Response } from 'express';
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
  const { addressId } = createOrderSchema.parse(req.body);

  const userId = currentUserId(req);
  const orderNumber = await orderService.createOrder(userId, addressId);

  res.status(201).json({ success: true, data: await orderService.getOrder(userId, orderNumber) });
}

export async function cancelOrder(req: Request, res: Response): Promise<void> {
  const input = cancelOrderSchema.parse(req.body);

  res.json({
    success: true,
    data: await orderService.cancelOrder(currentUserId(req), orderRef(req), input),
  });
}
