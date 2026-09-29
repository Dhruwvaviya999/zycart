import { z } from 'zod';
import { COUPON_CODE_PATTERN, COUPON_TYPES } from '../models/coupon.model';

/**
 * What a customer may send as a coupon code.
 *
 * Normalised to upper case before it is matched, so `welcome10` and `WELCOME10`
 * are one code — the same reason emails are lower-cased before they are stored.
 * The pattern refuses anything a real code could not be, which keeps a
 * pathological string from ever reaching a query.
 */
export const couponCodeSchema = z
  .string()
  .trim()
  .max(32, 'is not a valid code')
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(COUPON_CODE_PATTERN, 'is not a valid code'));

/** A timestamp from the console, with its offset. Converted to a Date once. */
const instant = z.iso
  .datetime({ offset: true, error: 'must be a date and time' })
  .transform((value) => new Date(value));

/** Whole rupees, bounded far above any real promotion so a stray keystroke is caught. */
const rupees = (min: number) => z.number().int('must be a whole number').min(min).max(10_000_000);

const couponFields = {
  description: z.string().trim().max(160).optional(),
  type: z.enum(COUPON_TYPES),
  value: rupees(1),
  maxDiscount: rupees(1).nullable().optional(),
  minOrderValue: rupees(0).optional(),
  startsAt: instant.nullable().optional(),
  expiresAt: instant.nullable().optional(),
  usageLimit: z.number().int().min(1).max(10_000_000).nullable().optional(),
  perUserLimit: z.number().int().min(1).max(1_000).nullable().optional(),
  isActive: z.boolean().optional(),
};

/**
 * The rules that span fields, stated once for both create and update.
 *
 * Update runs them against the coupon *as it would be after the change*, in the
 * service, because a partial body cannot be checked on its own — lowering a
 * PERCENT coupon's value is only wrong if the type is PERCENT, and that may be
 * a field the request did not send.
 */
export interface CouponShape {
  type: (typeof COUPON_TYPES)[number];
  value: number;
  maxDiscount?: number | null;
  startsAt?: Date | null;
  expiresAt?: Date | null;
}

export function couponShapeProblems(shape: CouponShape): { path: string; message: string }[] {
  const problems: { path: string; message: string }[] = [];

  if (shape.type === 'PERCENT' && shape.value > 100) {
    problems.push({ path: 'value', message: 'a percentage cannot be more than 100' });
  }

  if (shape.type === 'FLAT' && shape.maxDiscount) {
    problems.push({
      path: 'maxDiscount',
      message: 'only applies to percentage coupons — a flat coupon is already its own cap',
    });
  }

  if (shape.startsAt && shape.expiresAt && shape.expiresAt <= shape.startsAt) {
    problems.push({ path: 'expiresAt', message: 'must be after the start date' });
  }

  return problems;
}

export const createCouponSchema = z
  .object({ code: couponCodeSchema, ...couponFields })
  .strict()
  .superRefine((value, ctx) => {
    for (const problem of couponShapeProblems(value)) {
      ctx.addIssue({ code: 'custom', path: [problem.path], message: problem.message });
    }
  });

/**
 * Everything but the code.
 *
 * A code is immutable once created: orders record the code they used, and
 * renaming it would leave that history naming something that no longer exists.
 * `.strict()` makes an attempt to send one a 400 rather than a silent no-op.
 */
export const updateCouponSchema = z
  .object({
    ...couponFields,
    type: couponFields.type.optional(),
    value: couponFields.value.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'at least one field must be provided');

export const COUPON_STATES = ['ACTIVE', 'SCHEDULED', 'EXPIRED', 'EXHAUSTED', 'INACTIVE'] as const;

export const adminCouponQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(120).optional(),
    state: z.enum(COUPON_STATES).optional(),
  })
  .strict();

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
export type AdminCouponQuery = z.infer<typeof adminCouponQuerySchema>;
