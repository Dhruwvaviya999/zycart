import type { Request, Response } from 'express';
import * as userService from '../services/user.service';
import { AppError } from '../utils/AppError';
import {
  addressSchema,
  cartReminderOptOutSchema,
  updateAddressSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from '../validators/user.validator';

/** `requireAuth` guarantees this, but the check keeps the type honest. */
function currentUserId(req: Request): string {
  if (!req.user) throw new AppError('Not authenticated', 401);
  return req.user.id;
}

export async function getMe(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await userService.getProfile(currentUserId(req)) });
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const input = updateProfileSchema.parse(req.body);
  res.json({
    success: true,
    data: await userService.updateProfile(req.env, currentUserId(req), input),
  });
}

export async function updatePreferences(req: Request, res: Response): Promise<void> {
  const input = updatePreferencesSchema.parse(req.body);
  res.json({
    success: true,
    data: await userService.updatePreferences(currentUserId(req), input),
  });
}

/**
 * The one-click opt-out from a cart reminder. Public: the signed link is the
 * authority, not a session.
 */
export async function optOutOfCartReminders(req: Request, res: Response): Promise<void> {
  const { u, s } = cartReminderOptOutSchema.parse(req.body);

  await userService.optOutOfCartReminders(req.env.JWT_SECRET, u, s);

  res.json({
    success: true,
    message: 'Cart reminders are off. You can turn them back on from your account settings.',
  });
}

export async function listAddresses(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await userService.listAddresses(currentUserId(req)) });
}

export async function createAddress(req: Request, res: Response): Promise<void> {
  const input = addressSchema.parse(req.body);
  const addresses = await userService.createAddress(currentUserId(req), input);

  res.status(201).json({ success: true, data: addresses });
}

export async function updateAddress(req: Request, res: Response): Promise<void> {
  const input = updateAddressSchema.parse(req.body);
  const { addressId } = req.params as { addressId: string };

  res.json({
    success: true,
    data: await userService.updateAddress(currentUserId(req), addressId, input),
  });
}

export async function deleteAddress(req: Request, res: Response): Promise<void> {
  const { addressId } = req.params as { addressId: string };

  res.json({
    success: true,
    data: await userService.deleteAddress(currentUserId(req), addressId),
  });
}

export async function setDefaultAddress(req: Request, res: Response): Promise<void> {
  const { addressId } = req.params as { addressId: string };

  res.json({
    success: true,
    data: await userService.setDefaultAddress(currentUserId(req), addressId),
  });
}
