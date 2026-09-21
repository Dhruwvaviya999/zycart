import { z } from 'zod';
import { SORT_KEYS } from './product.validator';

/**
 * What the browser may ask smart search to interpret.
 *
 * The query is capped at a sentence, not a document: interpretation is a model
 * call priced by its input, and nobody searches a shop with three paragraphs.
 */
export const MAX_SEARCH_QUERY_LENGTH = 200;

/**
 * The filters the shopper set themselves.
 *
 * Sent so a new search does not discard a narrowing they chose deliberately —
 * these are applied last and win any conflict with the interpretation. The
 * storefront strips the fields a previous interpretation contributed before
 * sending, so a guessed filter never outlives the query that produced it.
 *
 * Every field is re-validated by the storefront's own product query schema
 * downstream; the limits here exist so an oversized payload is refused before
 * any work is done.
 */
const retainSchema = z
  .object({
    category: z.string().trim().max(60).optional(),
    brand: z.string().trim().max(60).optional(),
    color: z.string().trim().max(40).optional(),
    minPrice: z.number().int().nonnegative().max(10_000_000).optional(),
    maxPrice: z.number().int().nonnegative().max(10_000_000).optional(),
    minRating: z.number().min(0).max(5).optional(),
    inStock: z.boolean().optional(),
    sort: z.enum(SORT_KEYS).optional(),
  })
  .strict();

export const smartSearchSchema = z
  .object({
    query: z.string().trim().min(1, 'cannot be empty').max(MAX_SEARCH_QUERY_LENGTH),
    retain: retainSchema.optional(),
  })
  .strict();

export type SmartSearchInput = z.infer<typeof smartSearchSchema>;
