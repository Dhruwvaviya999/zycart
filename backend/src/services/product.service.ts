import { Types, type QueryFilter } from 'mongoose';
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

/**
 * Cards never render the long description or the spec table, so the list
 * endpoints leave them on the server.
 */
const LIST_FIELDS =
  'name slug shortDescription images price compareAtPrice category brand sku stock ' +
  'colors sizes tags rating reviewCount isFeatured isBestSeller isNewArrival createdAt';

const REFERENCE_FIELDS = 'name slug';

/** An id that can never match, so an unknown filter yields an empty page. */
const MATCHES_NOTHING = new Types.ObjectId('000000000000000000000000');

type ProductFilter = QueryFilter<ProductDocument>;

const SORTS: Record<ProductQuery['sort'], Record<string, 1 | -1>> = {
  // `_id` breaks ties so paging never repeats or skips a row.
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  oldest: { createdAt: 1, _id: 1 },
  rating: { rating: -1, reviewCount: -1, _id: 1 },
};

/** Matches a product's own text, or the name of the brand/category it belongs to. */
async function searchClauses(term: string): Promise<ProductFilter[]> {
  const pattern = new RegExp(escapeRegex(term), 'i');

  const [brands, categories] = await Promise.all([
    Brand.find({ name: pattern }).select('_id'),
    Category.find({ name: pattern }).select('_id'),
  ]);

  return [
    { name: pattern },
    { shortDescription: pattern },
    { sku: pattern },
    { tags: pattern },
    { brand: { $in: brands.map((brand) => brand._id) } },
    { category: { $in: categories.map((category) => category._id) } },
  ];
}

async function buildFilter(query: ProductQuery): Promise<ProductFilter> {
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

  if (query.search) {
    filter.$or = await searchClauses(query.search);
  }

  return filter;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function listProducts(query: ProductQuery) {
  const filter = await buildFilter(query);
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    Product.find(filter)
      .select(LIST_FIELDS)
      .populate('category', REFERENCE_FIELDS)
      .populate('brand', REFERENCE_FIELDS)
      .sort(SORTS[query.sort])
      .skip(skip)
      .limit(query.limit),
    Product.countDocuments(filter),
  ]);

  const pagination: Pagination = {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };

  return { items: items.map((item) => item.toJSON()), pagination };
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
    .populate('category', REFERENCE_FIELDS)
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

export async function createProduct(input: CreateProductInput) {
  await assertReferences(input.category, input.brand);
  assertPricing(input.price, input.compareAtPrice);

  const slug = await uniqueSlug(input.name, async (candidate) => {
    return (await Product.exists({ slug: candidate })) !== null;
  });

  const product = await Product.create({ ...input, slug });
  return getProduct(String(product._id));
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const existing = await Product.findById(id);
  if (!existing) throw new AppError('Product not found', 404);

  await assertReferences(input.category, input.brand);

  assertPricing(
    input.price ?? existing.price,
    input.compareAtPrice === undefined ? existing.compareAtPrice : input.compareAtPrice,
  );

  existing.set(input);
  await existing.save();

  return getProduct(String(existing._id));
}

export async function deleteProduct(id: string) {
  const product = await Product.findByIdAndDelete(id);
  if (!product) throw new AppError('Product not found', 404);
}
