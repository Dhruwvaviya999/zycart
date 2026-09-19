import { Types, type QueryFilter } from 'mongoose';
import { Brand } from '../../models/brand.model';
import { Category } from '../../models/category.model';
import { Product, STOCK_FILTERS, stockStateOf, type ProductDocument } from '../../models/product.model';
import { escapeRegex } from '../../validators/common';
import type { AdminCatalogueQuery, AdminProductQuery } from '../../validators/admin.validator';

/**
 * Catalogue listings for the admin console.
 *
 * Separate from the storefront's listing for one reason that matters: the shop
 * shows only what a customer may buy, and an operator has to see everything
 * they are responsible for — including the deactivated, the sold out and the
 * unlisted. Creating, updating and deleting are **not** here; those call the
 * existing product, category and brand services unchanged, so Phase 3's
 * validation applies to an administrator exactly as it does to anyone else.
 */

const LIST_FIELDS =
  'name slug images price compareAtPrice category brand sku stock isActive ' +
  'isFeatured isBestSeller isNewArrival rating reviewCount createdAt updatedAt';

const REFERENCE_FIELDS = 'name slug';

const SORTS: Record<AdminProductQuery['sort'], Record<string, 1 | -1>> = {
  // `_id` breaks ties so paging never repeats or skips a row.
  newest: { createdAt: -1, _id: 1 },
  oldest: { createdAt: 1, _id: 1 },
  name_asc: { name: 1, _id: 1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: 1 },
  stock_asc: { stock: 1, _id: 1 },
  stock_desc: { stock: -1, _id: 1 },
};

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  image: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  stockState: ReturnType<typeof stockStateOf>;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  isActive: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  rating: number;
  reviewCount: number;
  createdAt: string;
}

/**
 * Matches a product's own text, or the name of the brand or category it belongs
 * to — the same shape the storefront search uses, so an operator searching
 * "Nike" finds what a customer would.
 */
async function searchClauses(term: string) {
  const pattern = new RegExp(escapeRegex(term), 'i');

  const [brands, categories] = await Promise.all([
    Brand.find({ name: pattern }).select('_id'),
    Category.find({ name: pattern }).select('_id'),
  ]);

  return [
    { name: pattern },
    { sku: pattern },
    { slug: pattern },
    { brand: { $in: brands.map((brand) => brand._id) } },
    { category: { $in: categories.map((category) => category._id) } },
  ];
}

export async function listProducts(query: AdminProductQuery) {
  const filter: QueryFilter<ProductDocument> = {};

  // Absent means "either", which is the admin default: an operator looking for
  // a product should not have to know whether it is live.
  if (query.active !== undefined) filter.isActive = query.active;
  if (query.featured !== undefined) filter.isFeatured = query.featured;
  if (query.bestSeller !== undefined) filter.isBestSeller = query.bestSeller;
  if (query.newArrival !== undefined) filter.isNewArrival = query.newArrival;

  if (query.category) filter.category = new Types.ObjectId(query.category);
  if (query.brand) filter.brand = new Types.ObjectId(query.brand);

  if (query.stock) Object.assign(filter, STOCK_FILTERS[query.stock]);
  if (query.search) filter.$or = await searchClauses(query.search);

  const [products, total] = await Promise.all([
    Product.find(filter)
      .select(LIST_FIELDS)
      .populate('category', REFERENCE_FIELDS)
      .populate('brand', REFERENCE_FIELDS)
      .sort(SORTS[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Product.countDocuments(filter),
  ]);

  const reference = (value: unknown) => {
    const entry = value as { _id?: Types.ObjectId; name?: string } | null;
    return entry?._id ? { id: String(entry._id), name: entry.name ?? '' } : null;
  };

  const items: AdminProductRow[] = products.map((product) => ({
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    image: product.images[0] ?? '',
    sku: product.sku,
    price: product.price,
    compareAtPrice: product.compareAtPrice ?? null,
    stock: product.stock,
    stockState: stockStateOf(product.stock),
    category: reference(product.category),
    brand: reference(product.brand),
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    isBestSeller: product.isBestSeller,
    isNewArrival: product.isNewArrival,
    rating: product.rating,
    reviewCount: product.reviewCount,
    createdAt: product.createdAt.toISOString(),
  }));

  return { items, pagination: paginate(query, total) };
}

export interface AdminTaxonomyRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  isActive: boolean;
  /** How many products point at it — the number that decides whether it can go. */
  productCount: number;
  createdAt: string;
}

/** The shape a category and a brand have in common, once loaded. */
interface TaxonomyDocument {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  /** Categories carry an `image`; brands carry a `logo`. */
  image?: string;
  logo?: string;
  isActive: boolean;
  createdAt: Date;
}

/** Name or slug, the two things an operator would type. */
function taxonomyFilter(query: AdminCatalogueQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (query.active !== undefined) filter.isActive = query.active;

  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: pattern }, { slug: pattern }];
  }

  return filter;
}

/**
 * Attaches the product count that governs whether a category or brand can be
 * deleted.
 *
 * One grouped aggregation over products, not a query per row — this page shows
 * the whole taxonomy at once, and a count per row would be twenty round trips
 * to render it.
 */
async function withProductCounts(
  rows: TaxonomyDocument[],
  field: 'category' | 'brand',
): Promise<AdminTaxonomyRow[]> {
  const counts = await Product.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { [field]: { $in: rows.map((row) => row._id) } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ]);

  const byId = new Map(counts.map((entry) => [String(entry._id), entry.count]));

  return rows.map((row) => ({
    id: String(row._id),
    name: row.name,
    slug: row.slug,
    description: row.description ?? '',
    image: row.image ?? row.logo ?? '',
    isActive: row.isActive,
    productCount: byId.get(String(row._id)) ?? 0,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listCategories(query: AdminCatalogueQuery) {
  const filter = taxonomyFilter(query);

  const [rows, total] = await Promise.all([
    Category.find(filter)
      .sort({ name: 1, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Category.countDocuments(filter),
  ]);

  return {
    items: await withProductCounts(rows as unknown as TaxonomyDocument[], 'category'),
    pagination: paginate(query, total),
  };
}

export async function listBrands(query: AdminCatalogueQuery) {
  const filter = taxonomyFilter(query);

  const [rows, total] = await Promise.all([
    Brand.find(filter)
      .sort({ name: 1, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Brand.countDocuments(filter),
  ]);

  return {
    items: await withProductCounts(rows as unknown as TaxonomyDocument[], 'brand'),
    pagination: paginate(query, total),
  };
}

function paginate(query: { page: number; limit: number }, total: number) {
  return {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}
