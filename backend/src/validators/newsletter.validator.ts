import { z } from 'zod';
import { SUBSCRIBER_SOURCES, SUBSCRIBER_STATUSES } from '../models/subscriber.model';
import { normalisedEmail } from './auth.validator';
import { objectIdSchema } from './common';

/**
 * The sign-up form's body.
 *
 * The source is a label from a closed list — which form on the storefront the
 * address came from — so it cannot carry free text into the export.
 */
export const subscribeSchema = z
  .object({
    email: normalisedEmail,
    source: z.enum(SUBSCRIBER_SOURCES).default('homepage'),
  })
  .strict();

export const confirmSubscriptionSchema = z
  .object({ token: z.string().trim().min(16, 'is not a valid link').max(200) })
  .strict();

/** The signed unsubscribe link, as the page posts it back. */
export const unsubscribeSchema = z
  .object({
    id: objectIdSchema,
    s: z.string().min(20).max(100),
  })
  .strict();

export const adminSubscriberQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(SUBSCRIBER_STATUSES).optional(),
    search: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type AdminSubscriberQuery = z.infer<typeof adminSubscriberQuerySchema>;
