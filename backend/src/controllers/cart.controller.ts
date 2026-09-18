import type { Request, Response } from 'express';
import * as cartService from '../services/cart.service';
import { AppError } from '../utils/AppError';
import { idParamSchema } from '../validators/common';
import {
  addCartItemSchema,
  mergeCartSchema,
  previewCartSchema,
  updateCartItemSchema,
} from '../validators/cart.validator';

/**
 * Ownership comes from the verified session, never from the request body — there
 * is no path by which a client can name whose cart it is operating on.
 */
function currentUserId(req: Request): string {
  if (!req.user) throw new AppError('Not authenticated', 401);
  return req.user.id;
}

const itemParamSchema = idParamSchema.extend({});

function itemId(req: Request): string {
  return itemParamSchema.parse({ id: req.params.itemId }).id;
}

export async function getCart(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await cartService.getCart(currentUserId(req)) });
}

/**
 * The one public cart route: it resolves a guest's lines against live product
 * data and stores nothing, so a signed-out shopper sees the same prices and
 * stock as a signed-in one.
 */
export async function previewCart(req: Request, res: Response): Promise<void> {
  const input = previewCartSchema.parse(req.body);
  res.json({ success: true, data: await cartService.previewCart(input) });
}

export async function addItem(req: Request, res: Response): Promise<void> {
  const input = addCartItemSchema.parse(req.body);
  res
    .status(201)
    .json({ success: true, data: await cartService.addItem(currentUserId(req), input) });
}

export async function updateItem(req: Request, res: Response): Promise<void> {
  const { quantity } = updateCartItemSchema.parse(req.body);

  res.json({
    success: true,
    data: await cartService.updateItem(currentUserId(req), itemId(req), quantity),
  });
}

export async function removeItem(req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: await cartService.removeItem(currentUserId(req), itemId(req)),
  });
}

export async function clearCart(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await cartService.clearCart(currentUserId(req)) });
}

export async function mergeCart(req: Request, res: Response): Promise<void> {
  const input = mergeCartSchema.parse(req.body);
  res.json({ success: true, data: await cartService.mergeCart(currentUserId(req), input) });
}
