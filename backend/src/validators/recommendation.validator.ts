import { z } from 'zod';
import { objectIdSchema } from './common';

/**
 * Note what is absent: there is no `userId`.
 *
 * Whose recommendations these are is decided by the session cookie and nothing
 * else. A parameter naming a customer would be an authorisation decision made
 * from a query string, which is how one account ends up reading another's.
 */
export const recommendationQuerySchema = z.object({
  context: z.enum(['homepage', 'product', 'cart']).default('homepage'),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  /** Products already on the page, so a rail does not repeat them. */
  exclude: z.string().trim().max(600).optional(),
  /** The product being viewed, when `context=product`. */
  productId: objectIdSchema.optional(),
});

export const similarQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(4),
});

export type RecommendationQuery = z.infer<typeof recommendationQuerySchema>;
