import type { Request, Response } from 'express';
import * as wishlistService from '../services/wishlist.service';
import { AppError } from '../utils/AppError';
import { idParamSchema } from '../validators/common';
import { addWishlistItemSchema, moveToCartSchema } from '../validators/wishlist.validator';

function currentUserId(req: Request): string {
  if (!req.user) throw new AppError('Not authenticated', 401);
  return req.user.id;
}

function itemId(req: Request): string {
  return idParamSchema.parse({ id: req.params.itemId }).id;
}

export async function getWishlist(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await wishlistService.getWishlist(currentUserId(req)) });
}

export async function addItem(req: Request, res: Response): Promise<void> {
  const { productId } = addWishlistItemSchema.parse(req.body);

  res.status(201).json({
    success: true,
    data: await wishlistService.addWishlistItem(currentUserId(req), productId),
  });
}

export async function removeItem(req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: await wishlistService.removeWishlistItem(currentUserId(req), itemId(req)),
  });
}

export async function clearWishlist(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await wishlistService.clearWishlist(currentUserId(req)) });
}

/** Answers with both lists, so the client never has to guess the resulting state. */
export async function moveToCart(req: Request, res: Response): Promise<void> {
  const input = moveToCartSchema.parse(req.body ?? {});

  res.json({
    success: true,
    data: await wishlistService.moveToCart(currentUserId(req), itemId(req), input),
  });
}
