import { z } from 'zod';
import { objectIdSchema, queryBoolean } from './common';

const colorSchema = z.object({
  name: z.string().trim().min(1).max(40),
  hex: z
    .string()
    .trim()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'must be a hex colour'),
});

const sizeSchema = z.object({
  label: z.string().trim().min(1).max(20),
  inStock: z.boolean().optional(),
});

const specificationSchema = z.object({
  label: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(200),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(10).max(4000),
  shortDescription: z.string().trim().max(300).optional(),

  images: z.array(z.url().max(600)).min(1).max(10),

  // Whole rupees. Integer money is what keeps every total exact: subtotal is a
  // sum of products of integers, so no float arithmetic ever occurs.
  price: z.number().int('must be a whole number of rupees').nonnegative().max(10_000_000),
  compareAtPrice: z
    .number()
    .int('must be a whole number of rupees')
    .nonnegative()
    .max(10_000_000)
    .nullish(),

  category: objectIdSchema,
  brand: objectIdSchema,

  sku: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'may contain letters, digits and hyphens only'),
  stock: z.number().int().nonnegative().max(1_000_000),

  colors: z.array(colorSchema).max(20).optional(),
  sizes: z.array(sizeSchema).max(30).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  highlights: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
  specifications: z.array(specificationSchema).max(30).optional(),

  /**
   * `rating`, `reviewCount`, `ratingSum` and `ratingBreakdown` are absent on
   * purpose. From Phase 8 they are derived from approved reviews and maintained
   * atomically by the review service, so accepting them here would let a write
   * to the catalogue contradict the reviews underneath it. `.strict()` turns an
   * attempt to send one into a 400.
   */

  isFeatured: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),
  isNewArrival: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/**
 * `sku` and `slug` are immutable: the SKU identifies the item in inventory and
 * the slug is its public URL. Everything else can change.
 */
export const updateProductSchema = createProductSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'at least one field must be provided');

/**
 * `relevance` is new in Phase 11 and is the only sort whose order depends on
 * the search term. With no `search` it has nothing to rank, so the service
 * falls back to `newest` — the schema accepts it either way rather than making
 * a legal-looking URL a 400.
 */
export const SORT_KEYS = [
  'price_asc',
  'price_desc',
  'newest',
  'oldest',
  'rating',
  'relevance',
] as const;

export const productQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(12),
    search: z.string().trim().max(100).optional(),
    category: z.string().trim().max(200).optional(),
    brand: z.string().trim().max(200).optional(),
    minPrice: z.coerce.number().nonnegative().finite().optional(),
    maxPrice: z.coerce.number().nonnegative().finite().optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    inStock: queryBoolean,

    /**
     * Variant filters, added in Phase 11.
     *
     * They live here rather than in a smart-search-only schema because the
     * assistant must not have a query capability the storefront lacks: a colour
     * the AI can filter on is a colour a shopper can filter on, from the panel
     * or from the URL. One query layer, one set of rules.
     *
     * Matched against the product's own options, so an invented colourway
     * returns nothing rather than everything.
     */
    color: z.string().trim().max(40).optional(),
    size: z.string().trim().max(20).optional(),
    /** Comma-separated ids — how the cart and wishlist resolve what they stored. */
    ids: z.string().trim().max(2000).optional(),
    sort: z.enum(SORT_KEYS).default('newest'),
  })
  .refine(
    (value) =>
      value.minPrice === undefined ||
      value.maxPrice === undefined ||
      value.minPrice <= value.maxPrice,
    { path: ['minPrice'], error: 'must not be greater than maxPrice' },
  );

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
