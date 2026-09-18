import type { Request, Response } from 'express';
import * as checkoutService from '../services/checkout.service';
import { AppError } from '../utils/AppError';
import { checkoutSummaryQuerySchema } from '../validators/checkout.validator';

function currentUserId(req: Request): string {
  if (!req.user) throw new AppError('Not authenticated', 401);
  return req.user.id;
}

export async function getSummary(req: Request, res: Response): Promise<void> {
  const { addressId } = checkoutSummaryQuerySchema.parse(req.query);

  res.json({
    success: true,
    data: await checkoutService.getCheckoutSummary(currentUserId(req), addressId),
  });
}
