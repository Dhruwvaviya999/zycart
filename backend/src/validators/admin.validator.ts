import { z } from 'zod';
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from '../models/order.model';
import { REVIEW_STATUSES } from '../models/review.model';
import { objectIdSchema } from './common';

/**
 * Every admin query parameter, validated.
 *
 * `.strict()` throughout, so an unrecognised parameter is a 400 rather than
 * something that reaches a Mongo filter. Nothing here is ever spread into a
 * query object: each field is read by name and turned into a clause the service
 * builds itself.
 */

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

/** Free-text search, bounded so a pathological term cannot become a slow regex. */
const search = z.string().trim().min(1).max(120).optional();

export const PRODUCT_SORTS = [
  'newest',
  'oldest',
  'name_asc',
  'price_asc',
  'price_desc',
  'stock_asc',
  'stock_desc',
] as const;

export const adminProductQuerySchema = z
  .object({
    ...pagination,
    search,
    category: objectIdSchema.optional(),
    brand: objectIdSchema.optional(),
    stock: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
    /** Tri-state on purpose: absent means "either", which is the admin default. */
    active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    featured: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    bestSeller: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    newArrival: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    sort: z.enum(PRODUCT_SORTS).default('newest'),
  })
  .strict();

export const ORDER_SORTS = ['newest', 'oldest', 'total_desc', 'total_asc'] as const;

export const adminOrderQuerySchema = z
  .object({
    ...pagination,
    search,
    status: z.enum(ORDER_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    /** A fixed set of windows rather than arbitrary dates; see the dashboard. */
    period: z.enum(['7d', '30d', '90d', 'all']).default('all'),
    sort: z.enum(ORDER_SORTS).default('newest'),
  })
  .strict();

export const CUSTOMER_SORTS = ['newest', 'oldest', 'name_asc'] as const;

export const adminCustomerQuerySchema = z
  .object({
    ...pagination,
    search,
    active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    sort: z.enum(CUSTOMER_SORTS).default('newest'),
  })
  .strict();

export const REVIEW_SORTS = ['newest', 'oldest', 'rating_desc', 'rating_asc'] as const;

export const adminReviewQuerySchema = z
  .object({
    ...pagination,
    search,
    status: z.enum(REVIEW_STATUSES).optional(),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    verified: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    sort: z.enum(REVIEW_SORTS).default('newest'),
  })
  .strict();

export const adminCatalogueQuerySchema = z
  .object({
    ...pagination,
    search,
    active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  })
  .strict();

/**
 * The dashboard's window.
 *
 * Two choices, not a date picker. A custom range would need its own comparison
 * semantics and its own empty states to be honest, and neither is warranted by
 * the questions this dashboard answers.
 */
export const dashboardQuerySchema = z
  .object({ period: z.enum(['7d', '30d']).default('30d') })
  .strict();

/**
 * Changing an order's fulfilment state.
 *
 * `status` and an optional note, and nothing else. There is deliberately no
 * field here for payment state, pricing or the snapshot — an administrator
 * moves an order along its lifecycle, they do not rewrite what it was.
 */
export const orderStatusSchema = z
  .object({
    status: z.enum(ORDER_STATUSES),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

/**
 * Activating or deactivating a customer.
 *
 * Only `isActive`. Role is absent on purpose: turning a customer into an
 * administrator is a deliberate security decision, not a dropdown on a customer
 * page, and it is out of scope for this phase.
 */
export const customerStatusSchema = z.object({ isActive: z.boolean() }).strict();

export type AdminProductQuery = z.infer<typeof adminProductQuerySchema>;
export type AdminOrderQuery = z.infer<typeof adminOrderQuerySchema>;
export type AdminCustomerQuery = z.infer<typeof adminCustomerQuerySchema>;
export type AdminReviewQuery = z.infer<typeof adminReviewQuerySchema>;
export type AdminCatalogueQuery = z.infer<typeof adminCatalogueQuerySchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type OrderStatusInput = z.infer<typeof orderStatusSchema>;
export type CustomerStatusInput = z.infer<typeof customerStatusSchema>;
