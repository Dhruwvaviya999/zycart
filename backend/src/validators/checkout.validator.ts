import { z } from 'zod';
import { objectIdSchema } from './common';

/** The address is optional: the summary is useful before one has been chosen. */
export const checkoutSummaryQuerySchema = z
  .object({
    addressId: objectIdSchema.optional(),
  })
  .strict();

export type CheckoutSummaryQuery = z.infer<typeof checkoutSummaryQuerySchema>;
