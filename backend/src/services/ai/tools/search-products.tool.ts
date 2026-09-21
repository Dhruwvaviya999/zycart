import { z } from 'zod';
import { AI_LIMITS } from '../../../config/ai';
import * as productService from '../../product.service';
import { SORT_KEYS, productQuerySchema } from '../../../validators/product.validator';
import { defineTool } from './types';
import { remember, toProductView, type CatalogueProduct } from './product-view';

/**
 * Natural language in, the storefront's own catalogue query out.
 *
 * The model's entire job here is translation: "comfortable black shoes under
 * ₹3000" becomes `{ query: 'comfortable black shoes', maxPrice: 3000 }`. MongoDB
 * still performs the search, through `productService.listProducts` — the same
 * function behind `/shop` and `GET /api/products`. There is no second search
 * implementation to drift out of step with the one shoppers use, and no filter
 * the assistant can apply that the storefront could not.
 */
const input = z
  .object({
    query: z
      .string()
      .trim()
      .max(100)
      .optional()
      .describe(
        "Free text matched against product names, descriptions, tags, brand and category names. Use the customer's own words, minus anything expressed as a filter below.",
      ),
    category: z
      .string()
      .trim()
      .max(60)
      .optional()
      .describe('Category name or slug, e.g. "footwear". Only when the customer named one.'),
    brand: z
      .string()
      .trim()
      .max(60)
      .optional()
      .describe('Brand name or slug. Only when the customer named one.'),
    minPrice: z.number().int().nonnegative().max(10_000_000).optional().describe('In rupees.'),
    maxPrice: z
      .number()
      .int()
      .nonnegative()
      .max(10_000_000)
      .optional()
      .describe('In rupees. A stated budget is a hard limit, not a hint.'),
    minRating: z
      .number()
      .min(0)
      .max(5)
      .optional()
      .describe('Average rating floor, e.g. 4 for "highly rated".'),
    inStock: z.boolean().optional().describe('True to exclude sold-out products.'),
    sort: z
      .enum(SORT_KEYS)
      .optional()
      .describe('rating for "best rated", price_asc for "cheapest", newest for "latest".'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(AI_LIMITS.maxSearchLimit)
      .default(AI_LIMITS.defaultSearchLimit)
      .describe('How many products to return. Keep it small; the customer has to read them.'),
  })
  .strict();

export const searchProductsTool = defineTool({
  name: 'search_products',
  description:
    'Search the ZyCart catalogue. Returns a short list of matching products with live prices, ratings and stock. Use this for any request to find, browse, suggest or narrow down products, and again whenever the customer changes what they are looking for.',
  requiresAuth: false,
  input,

  async execute(args, context) {
    /**
     * Re-parsed through the storefront's own query schema rather than passed
     * straight through. It is the schema that owns the rules — a price range
     * the wrong way round, a rating above five — and running the model's
     * arguments through it means the assistant is held to exactly the same
     * ones as a shopper typing into the URL bar.
     */
    const query = productQuerySchema.parse({
      ...(args.query ? { search: args.query } : {}),
      ...(args.category ? { category: args.category } : {}),
      ...(args.brand ? { brand: args.brand } : {}),
      ...(args.minPrice === undefined ? {} : { minPrice: args.minPrice }),
      ...(args.maxPrice === undefined ? {} : { maxPrice: args.maxPrice }),
      ...(args.minRating === undefined ? {} : { minRating: args.minRating }),
      ...(args.inStock === undefined ? {} : { inStock: String(args.inStock) }),
      ...(args.sort ? { sort: args.sort } : {}),
      page: 1,
      limit: Math.min(args.limit, AI_LIMITS.maxSearchLimit),
    });

    const { items, pagination } = await productService.listProducts(query);
    const products = (items as CatalogueProduct[]).map(toProductView);

    remember(context.shown, products);

    return {
      returned: products.length,
      totalMatches: pagination.total,
      // Said plainly so the assistant offers to widen the search instead of
      // quietly presenting nothing as though it were the whole catalogue.
      note:
        pagination.total === 0
          ? 'No products matched. Suggest relaxing the budget, the category or the filters.'
          : undefined,
      products,
    };
  },
});
