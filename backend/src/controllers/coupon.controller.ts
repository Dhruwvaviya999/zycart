import type { Request, Response } from 'express';
import * as couponService from '../services/coupons/coupon.service';
import { requireActor } from '../utils/actor';
import { idParamSchema } from '../validators/common';
import {
  adminCouponQuerySchema,
  createCouponSchema,
  updateCouponSchema,
} from '../validators/coupon.validator';

/**
 * The console's coupon handlers.
 *
 * Thin, as every admin handler is: validate, delegate, answer. Every write
 * names its actor from the verified session, so the audit trail records who
 * the server authenticated rather than who a request body claimed to be.
 *
 * There is no customer-facing coupon endpoint beside these. A shopper applies a
 * code through the checkout summary and the order itself, which price it on the
 * server — a separate "validate this code" route would be one more way to probe
 * which codes exist, for no information the checkout does not already give.
 */

const id = (req: Request): string => idParamSchema.parse({ id: req.params.id }).id;

export async function listCoupons(req: Request, res: Response): Promise<void> {
  const query = adminCouponQuerySchema.parse(req.query);
  const { items, pagination } = await couponService.listCoupons(query);

  res.json({ success: true, data: items, pagination });
}

export async function getCoupon(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await couponService.getCoupon(id(req)) });
}

export async function createCoupon(req: Request, res: Response): Promise<void> {
  const input = createCouponSchema.parse(req.body);

  res.status(201).json({
    success: true,
    data: await couponService.createCoupon(input, requireActor(req)),
  });
}

export async function updateCoupon(req: Request, res: Response): Promise<void> {
  const input = updateCouponSchema.parse(req.body);

  res.json({
    success: true,
    data: await couponService.updateCoupon(id(req), input, requireActor(req)),
  });
}

/** The service refuses a coupon that has been used, and says to switch it off instead. */
export async function deleteCoupon(req: Request, res: Response): Promise<void> {
  await couponService.deleteCoupon(id(req), requireActor(req));

  res.json({ success: true, message: 'Coupon deleted' });
}
