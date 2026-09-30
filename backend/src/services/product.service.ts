import mongoose, { Types, type QueryFilter } from 'mongoose';
import { Brand } from '../models/brand.model';
import { Category } from '../models/category.model';
import { Product, type ProductDocument } from '../models/product.model';
import { AppError } from '../utils/AppError';
import { uniqueSlug } from '../utils/slugify';
import { escapeRegex, isObjectId } from '../validators/common';
import type {
  CreateProductInput,
  ProductQuery,
  UpdateProductInput,
} from '../validators/product.validator';
import { resolveBrandId } from './brand.service';
import { resolveCategoryId } from './category.service';
import { changed, recordAudit, type AuditActor } from './admin/audit.service';
import { recordMovement } from './inventory/inventory.service';
import { rankByRelevance, tokenize, type RankableProduct } from './search/relevance';

/**
 * Cards never render the long description or the spec table, so the list
 * endpoints leave them on the server.
 */
const LIST_FIELDS =
  'name slug shortDescription images price compareAtPrice category brand sku stock lowStockThreshold ' +
  'colors sizes tags rating reviewCount isFeatured isBestSeller isNewArrival createdAt';

const REFERENCE_FIELDS = 'name slug';

/** An id that can never match, so an unknown filter yields an empty page. */
const MATCHES_NOTHING = new Types.ObjectId('000000000000000000000000');

type ProductFilter = QueryFilter<ProductDocument>;

const SORTS: Record<Exclude<ProductQuery['sort'], 'relevance'>, Record<string, 1 | -1>> = {
  // `_id` breaks ties so paging never repeats or skips a row.
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  oldest: { createdAt: 1, _id: 1 },
  rating: { rating: -1, reviewCount: -1, _id: 1 },
};

/**
 * How many matching products relevance ranking will consider.
 *
 * Relevance cannot be expressed as a Mongo sort — it weighs six fields against
 * the search term — so the ranking happens in this process, which means it has
 * to be bounded. Sixty is five pages of twelve: far more than anyone scrolls
 * for a search they intend to refine, and small enough that scoring is
 * microseconds. Beyond it the shopper is better served by narrowing, which is
 * what the filters are for.
 */
const RELEVANCE_WINDOW = 60;

/**
 * Turns a search term into a filter.
 *
 * Every word has to match something; a word may match anything. "nike shoes"
 * finds Nike footwear because "nike" matches the brand and "shoes" matches the
 * category — which is how anyone would expect a shop to behave, and which this
 * search did not do before Phase 11: it matched the entire phrase as one
 * string, so "nike" found five products, "shoes" found eight, and "nike shoes"
 * found none. Anyone typing more than one word got an empty page.
 *
 * Words are ANDed and fields are ORed. That ordering is what keeps a two-word
 * search *narrower* than a one-word search rather than wider, which is the
 * property that makes adding a word feel like refining rather than gambling.
 */
const MAX_SEARCH_TOKENS = 6;

/**
 * Matches a word and its singular or plural form.
 *
 * Shoppers type "shoes"; catalogues are written "SuperRep Training Shoe". A
 * plain substring match misses that in both directions, which is how a search
 * for shoes ends up ranking a trouser first. Stripping a trailing "s" and
 * making it optional covers the overwhelming majority of English product nouns
 * without pulling in a stemming library for a catalogue of this size.
 *
 * Deliberately not a stemmer: "dress" must not become "dres".
 */
function searchPattern(token: string): string {
  const stem = token.length >= 4 && token.endsWith('s') ? token.slice(0, -1) : token;
  return `${escapeRegex(stem)}s?`;
}

type MatchMode = 'all' | 'any';

async function searchFilter(term: string, mode: MatchMode = 'all'): Promise<ProductFilter> {
  // The same tokenizer the ranking uses, so a product cannot pass the filter on
  // a word the scorer then ignores.
  const tokens = tokenize(term).slice(0, MAX_SEARCH_TOKENS);

  // Nothing usable — a query of punctuation, or of single letters.
  if (tokens.length === 0) {
    const pattern = new RegExp(escapeRegex(term), 'i');
    return { $or: [{ name: pattern }, { sku: pattern }] };
  }

  /**
   * Brands and categories are matched by name, so their ids have to be resolved
   * before the product query runs. Both lists are fetched once for all tokens
   * rather than once per token — two queries regardless of how long the search
   * is — and split per token in memory.
   */
  const anyToken = new RegExp(tokens.map(escapeRegex).join('|'), 'i');

  const [brands, categories] = await Promise.all([
    Brand.find({ name: anyToken }).select('_id name'),
    Category.find({ name: anyToken }).select('_id name'),
  ]);

  const idsMatching = (rows: { _id: unknown; name: string }[], token: string): Types.ObjectId[] =>
    rows
      .filter((row) => row.name.toLowerCase().includes(token))
      .map((row) => row._id as Types.ObjectId);

  const clauses: ProductFilter[] = tokens.map((token) => {
    const pattern = new RegExp(searchPattern(token), 'i');
    const brandIds = idsMatching(brands, token);
    const categoryIds = idsMatching(categories, token);

    return {
      $or: [
        { name: pattern },
        { shortDescription: pattern },
        { sku: pattern },
        { tags: pattern },
        ...(brandIds.length > 0 ? [{ brand: { $in: brandIds } }] : []),
        ...(categoryIds.length > 0 ? [{ category: { $in: categoryIds } }] : []),
      ],
    };
  });

  // `$and` rather than `$or`, so the clause cannot collide with another filter
  // that also wants `$or`.
  return mode === 'all' ? { $and: clauses } : { $and: [{ $or: clauses }] };
}

/** How many words a search needs before widening it is worth trying. */
const WIDENABLE_FROM_TOKENS = 2;

const tokenCount = (term: string): number => tokenize(term).length;

async function buildFilter(query: ProductQuery, mode: MatchMode = 'all'): Promise<ProductFilter> {
  const filter: ProductFilter = { isActive: true };

  if (query.ids) {
    // Anything that is not an id is dropped rather than rejected: the cart may
    // hold a product that has since been removed.
    const ids = query.ids
      .split(',')
      .map((value) => value.trim())
      .filter(isObjectId);
    filter._id = { $in: ids.map((id) => new Types.ObjectId(id)) };
  }

  if (query.category) {
    filter.category = (await resolveCategoryId(query.category)) ?? MATCHES_NOTHING;
  }

  if (query.brand) {
    filter.brand = (await resolveBrandId(query.brand)) ?? MATCHES_NOTHING;
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {
      ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
    };
  }

  if (query.minRating !== undefined && query.minRating > 0) {
    filter.rating = { $gte: query.minRating };
  }

  if (query.inStock !== undefined) {
    filter.stock = query.inStock ? { $gt: 0 } : 0;
  }

  if (query.color) {
    /**
     * Matched on a word boundary rather than on the whole string.
     *
     * Real catalogues name colourways, not colours: this one has "Triple
     * Black", "Gloss Black" and "Midnight" but only one plain "Black". An
     * anchored match would find the one and miss the rest, so a shopper asking
     * for black shoes would be told the store has almost none.
     *
     * The boundary is what keeps it honest — "Black" matches "Triple Black"
     * because that product genuinely is black, and does not match
     * "Blackcurrant" because that would be a different colour.
     */
    filter['colors.name'] = new RegExp(`\\b${escapeRegex(query.color)}\\b`, 'i');
  }

  if (query.size) {
    filter.sizes = {
      $elemMatch: { label: new RegExp(`^${escapeRegex(query.size)}$`, 'i'), inStock: true },
    };
  }

  if (query.search) {
    Object.assign(filter, await searchFilter(query.search, mode));
  }

  return filter;
}

/**
 * Resolves the filter, widening the search when the strict one finds nothing.
 *
 * Requiring every word keeps a two-word search narrower than a one-word one,
 * which is what makes adding a word feel like refining. It also means a
 * descriptive search finds nothing at all: "laptop for coding" asks for a
 * product whose text contains both "laptop" and "coding", and no catalogue
 * writes product copy that way.
 *
 * So the strict rule is tried first and kept whenever it works. Only when it
 * returns nothing does the search widen to "any of these words", with relevance
 * ranking putting whatever matched most first. Precision when precision is
 * possible, results when it is not — and never a blank page for a shopper who
 * simply described what they wanted.
 *
 * Costs two extra counts, and only on searches that would otherwise have been
 * empty.
 */
async function resolveFilter(
  query: ProductQuery,
  widen = true,
): Promise<{ filter: ProductFilter; total: number; widened: boolean }> {
  const strict = await buildFilter(query);
  const total = await Product.countDocuments(strict);

  if (!widen || total > 0 || !query.search || tokenCount(query.search) < WIDENABLE_FROM_TOKENS) {
    return { filter: strict, total, widened: false };
  }

  const loose = await buildFilter(query, 'any');
  return { filter: loose, total: await Product.countDocuments(loose), widened: true };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Relevance-ordered results.
 *
 * Reads one bounded window of matches, scores them here, then pages within
 * that window. The window is the honest limitation: a relevance search can show
 * the best sixty matches, not the best six hundred, because ranking them in
 * this process is what makes the order explainable in the first place.
 *
 * `total` stays the true match count so the header does not lie about how much
 * the catalogue holds; `totalPages` is capped to what this sort can actually
 * serve, so paging never lands on a blank page.
 */
async function listByRelevance(query: ProductQuery, filter: ProductFilter, total: number) {
  const candidates = await Product.find(filter)
    .select(LIST_FIELDS)
    .populate('category', REFERENCE_FIELDS)
    .populate('brand', REFERENCE_FIELDS)
    // A stable read order, so the window holds the same products each time and
    // the ranking below is the only thing deciding position.
    .sort({ createdAt: -1, _id: 1 })
    .limit(RELEVANCE_WINDOW);

  const ranked = rankByRelevance(
    candidates.map((item) => item.toJSON()) as unknown as RankableProduct[],
    {
      terms: query.search ?? '',
      ...(query.color ? { color: query.color } : {}),
      ...(query.maxPrice === undefined ? {} : { maxPrice: query.maxPrice }),
    },
  );

  const skip = (query.page - 1) * query.limit;
  const reachable = Math.min(total, RELEVANCE_WINDOW);

  const pagination: Pagination = {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(reachable / query.limit)),
  };

  return { items: ranked.slice(skip, skip + query.limit), pagination };
}

export interface ListOptions {
  /**
   * Whether a search that matches nothing may widen to "any of these words".
   *
   * Right for a shopper typing a sentence into the search bar, who is better
   * served by near matches than by a blank page. Wrong for the assistant: it
   * writes its own search terms and can try again with fewer words, and a
   * widened "running shoes" returns a running *tee* that it would then show as
   * though it were what the customer asked for.
   */
  widen?: boolean;
}

export async function listProducts(query: ProductQuery, options: ListOptions = {}) {
  const { filter, total } = await resolveFilter(query, options.widen ?? true);

  /**
   * Relevance with nothing to rank is just "newest", and saying so here means a
   * shared or bookmarked `?sort=relevance` URL with the search term removed
   * still renders a sensible page instead of an arbitrary one.
   */
  if (query.sort === 'relevance' && query.search) {
    return listByRelevance(query, filter, total);
  }

  const sort = query.sort === 'relevance' ? SORTS.newest : SORTS[query.sort];
  const skip = (query.page - 1) * query.limit;

  const items = await Product.find(filter)
    .select(LIST_FIELDS)
    .populate('category', REFERENCE_FIELDS)
    .populate('brand', REFERENCE_FIELDS)
    .sort(sort)
    .skip(skip)
    .limit(query.limit);

  const pagination: Pagination = {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };

  return { items: items.map((item) => item.toJSON()), pagination };
}

/**
 * The colour families the catalogue actually stocks.
 *
 * Catalogues name colourways, not colours — this one has "Triple Black",
 * "Gloss Black", "Midnight" and "Obsidian" where a shopper thinks "black". A
 * filter listing all forty colourway names is a list nobody reads, so the
 * families below are matched against the real names and only the ones with
 * stock behind them are offered.
 *
 * The families are a fixed vocabulary rather than something derived, because
 * "which of these words is a colour" is not a question the data can answer:
 * "Sail / Orange" and "Peacock Teal" both contain a family name and neither is
 * one. Matching a known list against real names keeps the filter honest in both
 * directions — nothing is offered that the store cannot deliver, and nothing is
 * invented that the store does not sell.
 */
const COLOR_FAMILIES = [
  'Black',
  'White',
  'Grey',
  'Blue',
  'Green',
  'Teal',
  'Pink',
  'Orange',
  'Brown',
  'Tan',
  'Sand',
  'Silver',
  'Gold',
] as const;

export async function listColorFamilies(): Promise<string[]> {
  const names = (await Product.distinct('colors.name', { isActive: true })) as string[];
  const haystack = names.join(' | ').toLowerCase();

  return COLOR_FAMILIES.filter((family) =>
    new RegExp(`\\b${family.toLowerCase()}\\b`).test(haystack),
  );
}

/**
 * How many products a query matches, without fetching any.
 *
 * Shares `buildFilter` with `listProducts`, so a count and the page it
 * describes can never disagree about what the criteria mean.
 */
export async function countProducts(query: ProductQuery): Promise<number> {
  return (await resolveFilter(query)).total;
}

/** Shared by the three merchandising endpoints, which differ only by flag. */
async function listByFlag(flag: 'isFeatured' | 'isBestSeller' | 'isNewArrival', limit: number) {
  const products = await Product.find({ [flag]: true, isActive: true })
    .select(LIST_FIELDS)
    .populate('category', REFERENCE_FIELDS)
    .populate('brand', REFERENCE_FIELDS)
    .sort({ createdAt: -1, _id: 1 })
    .limit(limit);

  return products.map((product) => product.toJSON());
}

export const listFeatured = (limit: number) => listByFlag('isFeatured', limit);
export const listBestSellers = (limit: number) => listByFlag('isBestSeller', limit);
export const listNewArrivals = (limit: number) => listByFlag('isNewArrival', limit);

/**
 * Slugs are the public handle and only ever resolve an active product; ids are
 * the admin handle and resolve regardless, so a draft can still be inspected.
 */
export async function getProduct(idOrSlug: string) {
  const byId = isObjectId(idOrSlug);
  const filter: ProductFilter = byId ? { _id: idOrSlug } : { slug: idOrSlug, isActive: true };

  const product = await Product.findOne(filter)
    // The detail page is the one place a product's category says whether it
    // can be tried on (Phase 19); the lists have no button to decide about.
    .populate('category', `${REFERENCE_FIELDS} tryOnEnabled`)
    .populate('brand', REFERENCE_FIELDS);

  if (!product) throw new AppError('Product not found', 404);
  return product.toJSON();
}

/** Same category, excluding the product itself. */
export async function listRelated(idOrSlug: string, limit: number) {
  const byId = isObjectId(idOrSlug);
  const source = await Product.findOne(byId ? { _id: idOrSlug } : { slug: idOrSlug }).select(
    '_id category',
  );

  if (!source) throw new AppError('Product not found', 404);

  const products = await Product.find({
    category: source.category,
    _id: { $ne: source._id },
    isActive: true,
  })
    .select(LIST_FIELDS)
    .populate('category', REFERENCE_FIELDS)
    .populate('brand', REFERENCE_FIELDS)
    .sort({ rating: -1, _id: 1 })
    .limit(limit);

  return products.map((product) => product.toJSON());
}

/** Both references must exist before a product can point at them. */
async function assertReferences(categoryId?: string, brandId?: string): Promise<void> {
  if (categoryId && (await Category.exists({ _id: categoryId })) === null) {
    throw new AppError('Category not found', 400);
  }

  if (brandId && (await Brand.exists({ _id: brandId })) === null) {
    throw new AppError('Brand not found', 400);
  }
}

/** A strike-through price below the real one would render as a negative discount. */
function assertPricing(price?: number, compareAtPrice?: number | null): void {
  if (price === undefined || compareAtPrice === undefined || compareAtPrice === null) return;
  if (compareAtPrice <= price) {
    throw new AppError('compareAtPrice must be greater than price', 400);
  }
}

/**
 * Creates a product, and opens its inventory ledger.
 *
 * The quantity a product is created with is a real stock movement — the only
 * one with no prior quantity to start from — so it is recorded as INITIAL_STOCK
 * rather than appearing from nowhere. Without it a product's timeline would
 * begin mid-story: a sale of two from a stock of ten, no record of where the
 * ten came from, and no way to check the ledger's arithmetic against the
 * product it describes.
 *
 * The product and its opening movement are written in one transaction, so a
 * product can never exist with a ledger that disagrees about where it started.
 *
 * `actor` is optional because the seed creates products with no administrator
 * behind them. The movement is still written — the stock is real either way —
 * and the audit row is not, because there is nobody to attribute it to.
 */
export async function createProduct(input: CreateProductInput, actor?: AuditActor) {
  await assertReferences(input.category, input.brand);
  assertPricing(input.price, input.compareAtPrice);

  const slug = await uniqueSlug(input.name, async (candidate) => {
    return (await Product.exists({ slug: candidate })) !== null;
  });

  const session = await mongoose.startSession();

  try {
    let createdId = '';

    await session.withTransaction(async () => {
      const [product] = await Product.create([{ ...input, slug }], { session });
      if (!product) throw new AppError('Could not create the product', 500);

      createdId = String(product._id);

      // Zero opening stock is not a movement: nothing moved, and a "+0" row
      // would be the one entry in the ledger whose arithmetic says nothing.
      if (product.stock > 0) {
        await recordMovement(
          {
            product: product._id,
            productName: product.name,
            sku: product.sku,
            type: 'INITIAL_STOCK',
            quantityBefore: 0,
            quantityChange: product.stock,
            referenceType: 'PRODUCT',
            referenceId: product._id,
            referenceLabel: product.sku,
            actor: actor ?? null,
          },
          session,
        );
      }

      if (actor) {
        await recordAudit(
          {
            actor,
            action: 'PRODUCT_CREATED',
            entityType: 'PRODUCT',
            entityId: product._id,
            entityLabel: product.name,
            summary: `Product created: ${product.name} (${product.sku}), opening stock ${product.stock}`,
          },
          session,
        );
      }
    });

    return getProduct(createdId);
  } finally {
    await session.endSession();
  }
}

/**
 * The product fields worth reporting in the audit trail.
 *
 * A named list rather than a diff of the request body, so a field added later —
 * one that might carry something private, or simply something nobody needs to
 * read in a log — cannot arrive here by accident. Images, descriptions,
 * highlights and specifications are excluded not because they are sensitive but
 * because a before/after of four thousand characters is not an entry anybody
 * reads.
 */
const AUDITED_PRODUCT_FIELDS = [
  'name',
  'price',
  'compareAtPrice',
  'isActive',
  'isFeatured',
  'isBestSeller',
  'isNewArrival',
] as const;

/**
 * Updates a product — everything except its stock.
 *
 * `stock` is absent from `updateProductSchema` on purpose, and this is the
 * reason. Setting a total is the one shape of write that cannot be made safe:
 * it silently discards whatever happened between the form loading and the form
 * saving, and it carries no reason, so the change is unexplainable a week
 * later. Stock moves through `adjustStock`, which takes a signed amount and a
 * reason and applies both atomically.
 *
 * An older client that still sends `stock` is not rejected — the schema strips
 * unknown keys — so the field is simply no longer honoured here.
 */
export async function updateProduct(id: string, input: UpdateProductInput, actor?: AuditActor) {
  const existing = await Product.findById(id);
  if (!existing) throw new AppError('Product not found', 404);

  await assertReferences(input.category, input.brand);

  assertPricing(
    input.price ?? existing.price,
    input.compareAtPrice === undefined ? existing.compareAtPrice : input.compareAtPrice,
  );

  const before = existing.toObject();

  existing.set(input);
  await existing.save();

  if (actor) {
    const changes = AUDITED_PRODUCT_FIELDS.flatMap((field) =>
      changed(field, before[field], existing[field]),
    );

    await recordAudit({
      actor,
      action: 'PRODUCT_UPDATED',
      entityType: 'PRODUCT',
      entityId: existing._id,
      entityLabel: existing.name,
      summary:
        changes.length > 0
          ? `Product updated: ${existing.name} · ${changes.map((change) => change.field).join(', ')}`
          : `Product updated: ${existing.name}`,
      changes,
    });
  }

  return getProduct(String(existing._id));
}

/**
 * Deletes a product.
 *
 * Its inventory movements are deliberately left behind. They record stock that
 * really moved and orders that really shipped, and each one carries its own
 * copy of the name and SKU precisely so that it still reads correctly once the
 * product is gone.
 */
export async function deleteProduct(id: string, actor?: AuditActor) {
  const product = await Product.findByIdAndDelete(id);
  if (!product) throw new AppError('Product not found', 404);

  if (actor) {
    await recordAudit({
      actor,
      action: 'PRODUCT_DELETED',
      entityType: 'PRODUCT',
      entityId: product._id,
      entityLabel: product.name,
      summary: `Product deleted: ${product.name} (${product.sku}), stock was ${product.stock}`,
    });
  }
}
