import { z } from 'zod';
import {
  ADJUSTMENT_REASONS,
  MAX_ADJUSTMENT,
  MOVEMENT_TYPES,
} from '../models/inventory-movement.model';
import { MAX_LOW_STOCK_THRESHOLD } from '../models/product.model';
import { objectIdSchema } from './common';

/**
 * Inventory input, validated on the server.
 *
 * The browser validates the same things for the operator's benefit — it should
 * not be possible to submit a form that was always going to fail — but none of
 * that is trusted here. Every rule that protects the data is in this file and
 * in the service, and the endpoints are reachable without the console.
 *
 * `.strict()` throughout: an unrecognised field is a 400 rather than something
 * that reaches a Mongo update. That is what closes mass assignment on these
 * endpoints — there is no `stock`, no `price` and no `isActive` in any schema
 * below, so no body can set them however it is shaped.
 */

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const search = z.string().trim().min(1).max(120).optional();

export const INVENTORY_SORTS = ['stock_asc', 'stock_desc', 'name_asc', 'updated_desc'] as const;

export const adminInventoryQuerySchema = z
  .object({
    ...pagination,
    search,
    /** The three stock states, resolved against each product's own threshold. */
    status: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
    category: objectIdSchema.optional(),
    brand: objectIdSchema.optional(),
    active: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    /** Products whose stock moved in the last week, for reviewing recent work. */
    recentlyChanged: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    /** Scarcest first by default: the screen exists to surface what is running out. */
    sort: z.enum(INVENTORY_SORTS).default('stock_asc'),
  })
  .strict();

/**
 * A stock correction.
 *
 * `quantityChange` is signed and never zero, because "adjust by nothing" is not
 * an operation — it would write a ledger entry describing no change. It is also
 * bounded: a mistyped extra digit should be a validation error, not an
 * emptied warehouse.
 *
 * There is deliberately **no** field here that sets a total. See `adjustStock`
 * for why a delta is the safe primitive and a total is not.
 */
export const adjustStockSchema = z
  .object({
    quantityChange: z
      .number({ error: 'is required — the amount to add or remove' })
      .int('must be a whole number of units')
      .refine((value) => value !== 0, 'must not be zero')
      .refine(
        (value) => Math.abs(value) <= MAX_ADJUSTMENT,
        `must be between -${MAX_ADJUSTMENT} and ${MAX_ADJUSTMENT}`,
      ),

    /** Required: an adjustment without a reason is a mystery in the ledger. */
    reason: z.enum(ADJUSTMENT_REASONS, { error: 'is required — say why stock is changing' }),

    note: z.string().trim().max(300).optional(),

    /**
     * What the operator was looking at, for reporting only.
     *
     * Never a precondition. A delta applied to authoritative state is correct
     * whatever a stale screen showed, so blocking on this would fail legitimate
     * work; the server compares it only so the response can say "stock had
     * already moved" instead of reporting a number the operator did not expect.
     */
    shownStock: z.number().int().min(0).max(10_000_000).optional(),

    /**
     * A hard precondition, sent only by the "set to counted total" path.
     *
     * A recount is a claim about a total rather than about a difference, so if
     * the total moved while the shelf was being counted, the derived delta is
     * wrong and the write must fail. Joined into the same atomic filter as the
     * update, so this is not a read-then-write check.
     */
    expectedStock: z.number().int().min(0).max(10_000_000).optional(),
  })
  .strict();

/** Setting or clearing a product's own low-stock threshold. */
export const setThresholdSchema = z
  .object({
    /** Null restores the store-wide default rather than pinning it to today's value. */
    lowStockThreshold: z.number().int().min(0).max(MAX_LOW_STOCK_THRESHOLD).nullable(),
  })
  .strict();

export const movementQuerySchema = z
  .object({
    ...pagination,
    product: objectIdSchema.optional(),
    type: z.enum(MOVEMENT_TYPES).optional(),
  })
  .strict();

export type AdminInventoryQuery = z.infer<typeof adminInventoryQuerySchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type SetThresholdInput = z.infer<typeof setThresholdSchema>;
export type MovementQuery = z.infer<typeof movementQuerySchema>;
