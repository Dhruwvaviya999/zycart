import { z } from 'zod';
import { AI_LIMITS } from '../../../config/ai';
import * as productService from '../../product.service';
import { SORT_KEYS, productQuerySchema } from '../../../validators/product.validator';
import { limitToBudget, type PriceBounds } from '../search/budget';
import { ToolError, defineTool, type SearchGuard } from './types';
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
        'The product words, matched against names, descriptions, tags, brands and categories — e.g. "running shoes", not the whole sentence, and without anything expressed as a filter below. Every word must match.',
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
    'Search the ZyCart catalogue. Returns a short list of matching products with live prices, ratings and stock. Every product it returns is shown to the customer as a card, so search only for what they asked for. Use this for any request to find, browse, suggest or narrow down products, and again whenever the customer changes what they are looking for.',
  requiresAuth: false,
  input,

  async execute(args, context) {
    const guard = context.search;

    if (guard && browsesAfterNothing(args, guard)) {
      throw new ToolError(BROWSE_AFTER_NOTHING);
    }

    // The customer's own budget, whatever the model sent — see `budget.ts`.
    const price = limitToBudget(
      { minPrice: args.minPrice, maxPrice: args.maxPrice },
      guard?.budget ?? {},
    );

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
      ...(price.minPrice === undefined ? {} : { minPrice: price.minPrice }),
      ...(price.maxPrice === undefined ? {} : { maxPrice: price.maxPrice }),
      ...(args.minRating === undefined ? {} : { minRating: args.minRating }),
      ...(args.inStock === undefined ? {} : { inStock: String(args.inStock) }),
      ...(args.sort ? { sort: args.sort } : {}),
      page: 1,
      limit: Math.min(args.limit, AI_LIMITS.maxSearchLimit),
    });

    // No widening to "any of these words": see `ListOptions.widen`.
    const { items, pagination } = await productService.listProducts(query, { widen: false });
    const products = (items as CatalogueProduct[]).map(toProductView);

    remember(context.shown, products);

    const budgetApplied = price.clamped
      ? { minPrice: price.minPrice, maxPrice: price.maxPrice }
      : undefined;

    if (pagination.total > 0) {
      return { returned: products.length, totalMatches: pagination.total, budgetApplied, products };
    }

    if (guard) guard.foundNothing = true;

    /**
     * Nothing within the price limits: the closest match outside them, as a
     * fact for the answer — "the cheapest is ₹4,999" — and not as a card. The
     * customer decides whether to see products over their budget.
     */
    const bounded = price.minPrice !== undefined || price.maxPrice !== undefined;
    const outside = bounded
      ? await productService.listProducts(
          {
            ...query,
            minPrice: undefined,
            maxPrice: undefined,
            sort: price.maxPrice === undefined ? 'price_desc' : 'price_asc',
            limit: 1,
          },
          { widen: false },
        )
      : null;

    const closest = (outside?.items[0] ?? null) as { name?: string; price?: number } | null;

    return {
      returned: 0,
      totalMatches: 0,
      budgetApplied,
      outsideBudget:
        outside && closest?.name && closest.price !== undefined
          ? {
              matches: outside.pagination.total,
              closest: { name: closest.name, price: closest.price },
            }
          : undefined,
      note: nothingMatchedNote(price, outside?.pagination.total ?? 0, closest),
      products,
    };
  },
});

const BROWSE_AFTER_NOTHING =
  'Nothing matched what the customer asked for, and a search without product words would ' +
  'only show them unrelated products. Answer now: tell them nothing matched, and offer to ' +
  'widen the search. Search more widely only if they ask.';

/**
 * A search that names no product at all — no words, no category, no brand —
 * after one that found nothing.
 *
 * That is the assistant giving up on what the customer asked for and showing
 * whatever is in the price range instead: kitchen goods for a request for
 * running shoes. Retrying with other words ("sneakers" after "running shoes")
 * is still allowed; it is the same request, differently put.
 */
export function browsesAfterNothing(
  args: { query?: string; category?: string; brand?: string },
  guard: SearchGuard,
): boolean {
  return guard.foundNothing && !args.query && !args.category && !args.brand;
}

const rupees = (amount: number) => `₹${new Intl.NumberFormat('en-IN').format(amount)}`;

/** What the model is told when a search finds nothing — the answer, not a hint to keep looking. */
export function nothingMatchedNote(
  price: PriceBounds,
  matchesOutside: number,
  closest: { name?: string; price?: number } | null,
): string {
  const limit =
    price.maxPrice !== undefined && price.minPrice !== undefined
      ? `between ${rupees(price.minPrice)} and ${rupees(price.maxPrice)}`
      : price.maxPrice !== undefined
        ? `at or under ${rupees(price.maxPrice)}`
        : price.minPrice !== undefined
          ? `at or over ${rupees(price.minPrice)}`
          : null;

  if (limit && matchesOutside > 0 && closest?.name && closest.price !== undefined) {
    return (
      `Nothing matches ${limit}. ${String(matchesOutside)} match outside that price; the ` +
      `closest is "${closest.name}" at ${rupees(closest.price)}. Tell the customer this plainly ` +
      'and ask whether they want to see them. Do not show products outside their price unless ' +
      'they ask.'
    );
  }

  return (
    `No products matched${limit ? ` ${limit}` : ''}. Tell the customer plainly and suggest what ` +
    'they could change. Do not search again with fewer requirements, or show other products, ' +
    'unless they ask.'
  );
}
