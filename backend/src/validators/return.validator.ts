import { z } from 'zod';
import {
  MAX_RETURN_ITEMS,
  MAX_RETURN_NOTE_LENGTH,
  RETURN_REASONS,
  RETURN_STATUSES,
} from '../models/return.model';
import { objectIdSchema } from './common';

/**
 * Return input, validated on the server.
 *
 * ## What is absent is the design
 *
 * `.strict()` throughout, and look at what no schema in this file contains:
 * there is no `refundAmount`, no `unitPrice`, no `status`, no `userId` and no
 * `orderId` in a body. A customer says which lines and how many; an operator
 * says how many they agree to and why. Every rupee is computed on the server
 * from the order's own historical snapshot, so there is no field through which
 * anybody — customer or administrator — could suggest what a refund is worth.
 *
 * The one quantity a client does send is bounded here and then checked again
 * against the order inside the transaction that writes it. This layer exists so
 * that an obviously wrong request fails cheaply with a field-level message; the
 * layer that actually protects the data is in `return.service`.
 */

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
};

/**
 * A quantity of returnable units.
 *
 * Capped at a number no real order line reaches, because the real ceiling is
 * "how many were bought", which only the server knows. This stops an absurd
 * figure reaching a database query; the service refuses anything above what was
 * actually purchased and still unreturned.
 */
const quantity = z
  .number({ error: 'is required' })
  .int('must be a whole number of units')
  .min(1, 'must be at least 1')
  .max(1_000, 'is larger than any order line');

const note = z.string().trim().max(MAX_RETURN_NOTE_LENGTH);

/**
 * Raising a return.
 *
 * Reasons are per line rather than per request, because an order can contain a
 * damaged item and one that simply does not fit, and forcing one reason across
 * both would put a falsehood on the record that later reporting would repeat.
 */
export const createReturnSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            orderItemId: objectIdSchema,
            quantity,
            reason: z.enum(RETURN_REASONS, { error: 'is required — tell us what went wrong' }),
          })
          .strict(),
      )
      .min(1, 'choose at least one item to return')
      .max(MAX_RETURN_ITEMS, `a return can cover at most ${MAX_RETURN_ITEMS} lines`)
      .refine(
        (items) => new Set(items.map((item) => item.orderItemId)).size === items.length,
        'each item can only appear once — combine the quantities instead',
      ),
    note: note.optional(),
  })
  .strict();

export const returnQuerySchema = z
  .object({
    ...pagination,
    status: z.enum(RETURN_STATUSES).optional(),
  })
  .strict();

/** Returns are addressed by their number or their id, exactly as orders are. */
export const returnRefSchema = z.object({
  returnRef: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'is not a valid return reference'),
});

/* ---------------------------------------------------------------- */
/* Admin                                                             */
/* ---------------------------------------------------------------- */

export const RETURN_SORTS = ['newest', 'oldest'] as const;

export const adminReturnQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(60).optional(),
    status: z.enum(RETURN_STATUSES).optional(),
    sort: z.enum(RETURN_SORTS).default('newest'),
  })
  .strict();

/**
 * Approving or rejecting.
 *
 * ## Two notes, and why both exist
 *
 * `resolutionNote` is written *to* the customer and appears on their return
 * page. `adminNote` is internal and never leaves the console. One field would
 * have forced a choice between a rejection with no explanation and internal
 * commentary shown to the person it is about.
 *
 * ## Why approved quantities are optional
 *
 * Omitting them approves what was asked for, which is the common case and
 * should not require the console to echo the request back. Supplying them
 * approves less — never more; the service refuses that — and the difference is
 * released so the customer can ask again for the rest.
 */
export const returnDecisionSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            orderItemId: objectIdSchema,
            approvedQuantity: z.number().int().min(0).max(1_000),
          })
          .strict(),
      )
      .max(MAX_RETURN_ITEMS)
      .optional(),
    resolutionNote: note.optional(),
    adminNote: note.optional(),
  })
  .strict();

/**
 * Rejecting, which requires a reason.
 *
 * The one place in this phase where a note is mandatory. A customer told only
 * "rejected" is left holding an item they cannot send back with no idea why,
 * and no amount of good UI elsewhere makes up for that — so the server refuses
 * to record a rejection without an explanation rather than trusting the form to
 * ask for one.
 */
export const returnRejectionSchema = returnDecisionSchema
  .omit({ items: true })
  .extend({
    resolutionNote: note.min(
      10,
      'tell the customer why, in a sentence — they will read this',
    ),
  })
  .strict();

/**
 * Marking goods received.
 *
 * `resellable` is required and has no default. It is the judgement that decides
 * whether units rejoin sellable stock, and a default would mean the system
 * making that call on the operator's behalf — in one direction inventing stock
 * ZyCart may not be able to ship, in the other quietly writing off goods that
 * were fine. The dialog pre-selects a suggestion based on the return reason;
 * the operator confirms it.
 */
export const receiveReturnSchema = z
  .object({
    resellable: z.boolean({ error: 'is required — say whether these units can be sold again' }),
    adminNote: note.optional(),
  })
  .strict();

export type CreateReturnInput = z.infer<typeof createReturnSchema>;
export type ReturnQuery = z.infer<typeof returnQuerySchema>;
export type AdminReturnQuery = z.infer<typeof adminReturnQuerySchema>;
export type ReturnDecisionInput = z.infer<typeof returnDecisionSchema>;
export type ReceiveReturnInput = z.infer<typeof receiveReturnSchema>;
