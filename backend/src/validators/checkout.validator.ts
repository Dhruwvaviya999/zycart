import { z } from 'zod';
import { objectIdSchema } from './common';

/**
 * The address is optional: the summary is useful before one has been chosen.
 *
 * So is the coupon, and it is deliberately loose here. A code that does not
 * apply is not a malformed request — the summary comes back priced without it,
 * with the reason beside the field the customer typed into — so anything short
 * enough to be a code is passed through, and `lookupCoupon` says whether it is
 * one. Only the length is bounded, so no request can hand a query an essay.
 */
export const checkoutSummaryQuerySchema = z
  .object({
    addressId: objectIdSchema.optional(),
    couponCode: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

export type CheckoutSummaryQuery = z.infer<typeof checkoutSummaryQuerySchema>;
